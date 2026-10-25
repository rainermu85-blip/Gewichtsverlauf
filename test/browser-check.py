"""Optional: run npm run dev, then python test/browser-check.py.
Requires Playwright for Python and Chromium; uses an isolated temporary profile.
"""
import json
import os
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

base = 'http://localhost:4173/Gewichtsverlauf/'
errors = []
with tempfile.TemporaryDirectory() as profile, sync_playwright() as p:
    def launch():
        return p.chromium.launch_persistent_context(
            profile, executable_path=os.environ.get('CHROMIUM_BIN', '/usr/bin/chromium'),
            headless=True, args=['--no-sandbox'], viewport={'width':390,'height':844},
            locale='de-DE', accept_downloads=True)

    context = launch()
    page = context.pages[0]
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(base)
    expect(page.locator('#entry-view')).to_be_visible()
    page.locator('#weight').fill('78,44')
    page.locator('#save').click()
    expect(page.locator('#form-error')).to_be_visible()

    def add(day, weight):
        if page.locator('#history-view').is_visible():
            page.locator('#new-entry').click()
        page.locator('#day').fill(day)
        page.locator('#weight').fill(weight)
        page.locator('#save').click()
        expect(page.locator('#history-view')).to_be_visible()

    add('2025-12-01', '79,7')
    add('2025-12-06', '79,1')
    add('2026-03-03', '78,9')
    expect(page.locator('#entries tr')).to_have_count(3)
    points = page.locator('#chart .point').evaluate_all('(els) => els.map(el=>Number(el.getAttribute("cx")))')
    assert abs((points[2]-points[1])/(points[1]-points[0])-87/5)<1e-5
    with page.expect_download() as download:
        page.locator('#backup').click()
    backup = Path(download.value.path()).read_text()
    saved = Path(profile)/'saved-backup.json'
    saved.write_text(backup)
    assert len(json.loads(backup)['entries'])==3
    # Close the entire browser, not just a tab. The same profile retains IndexedDB.
    context.close()
    context = launch()
    page = context.pages[0]
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(base)
    expect(page.locator('#count')).to_have_text('3')
    # Remove both HTTP cache and the app-file caches, while leaving IndexedDB.
    context.new_cdp_session(page).send('Network.clearBrowserCache')
    page.evaluate('async () => { for(const key of await caches.keys()) await caches.delete(key); }')
    page.reload()
    expect(page.locator('#count')).to_have_text('3')
    # Online visits rebuild the program-file cache after it has been cleared.
    page.evaluate('navigator.serviceWorker.ready')
    page.wait_for_function('async () => !!(await caches.match(new URL("index.html", location.href).href))')
    context.set_offline(True)
    page.goto(base)
    expect(page.locator('#entry-view')).to_be_visible()
    add('2026-03-04', '78,8')
    expect(page.locator('#entries tr')).to_have_count(4)
    page.reload()
    expect(page.locator('#count')).to_have_text('4')
    context.set_offline(False)
    # Delete, restore a backup, and verify merge preserves unrelated days.
    page.locator('#tab-history').click()
    page.get_by_role('button',name='Eintrag vom 06.12.2025 löschen',exact=True).click()
    page.locator('#confirm-button').click()
    expect(page.locator('#entries tr')).to_have_count(3)
    page.locator('#backup-file').set_input_files(str(saved))
    expect(page.locator('#confirm-dialog')).to_be_visible()
    page.locator('#confirm-button').click()
    expect(page.locator('#entries tr')).to_have_count(4)
    # Invalid backups do not change any existing values.
    bad = Path(profile)/'bad.json'
    bad.write_text('{"format":"gewichtsverlauf","version":1,"entries":[{"day":"2026-02-30","weight":79}]}')
    page.locator('#backup-file').set_input_files(str(bad))
    expect(page.locator('#global-error')).to_be_visible()
    expect(page.locator('#entries tr')).to_have_count(4)
    # App files may be fetched, but weights must never be sent to an API.
    assert not page.evaluate('performance.getEntriesByType("resource").some(r=>r.name.includes("/api/"))')
    for width in (320,390,768,1280):
        page.set_viewport_size({'width':width,'height':900})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(Path(__file__).resolve().parents[1]/'docs/vorschau.png'), full_page=True)
    assert not errors, errors
    context.close()
print('Browserprüfung bestanden: IndexedDB, Browserneustart, Cache-Löschung, Offline-Schreiben, Wiederherstellung, Zeitachse, Unterpfad und Layout.')
