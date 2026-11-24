import asyncio, re, time
from playwright.async_api import async_playwright
B='http://localhost:8080'; s=str(int(time.time())%100000); email=f'qa{s}@example.com'
errors=[]
import json, urllib.request
def link_from_log():
    time.sleep(1)
    msgs=json.load(urllib.request.urlopen('http://localhost:8025/api/v1/messages'))['messages']
    mid=[m for m in msgs if email in json.dumps(m['To'])][0]['ID']
    body=json.load(urllib.request.urlopen(f'http://localhost:8025/api/v1/message/{mid}'))['Text']
    return re.findall(r'http://localhost:8080/verify-email\?token=\S+', body)[-1]
async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(args=['--no-sandbox'])
        pg = await (await br.new_context(viewport={'width':1500,'height':900})).new_page()
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('console', lambda m: m.type=='error' and 'Failed to load resource' not in m.text and errors.append(m.text))
        await pg.goto(B+'/')
        await pg.wait_for_selector('text=Log in'); await pg.screenshot(path='e2e/shots/t01-login.png')
        await pg.click('text=Create an account'); await pg.fill('input[type=email]', email)
        pw=pg.locator('input[type=password]'); await pw.nth(0).fill('password123'); await pw.nth(1).fill('password123')
        await pg.click('button:has-text("Sign up")'); await pg.wait_for_selector('text=Check your email')
        # unverified login blocked
        await pg.goto(B+'/login'); await pg.fill('input[type=email] >> nth=0', email); await pg.fill('input[type=password]', 'password123')
        await pg.click('button:has-text("Log in")'); await pg.wait_for_selector('text=not verified')
        await pg.screenshot(path='e2e/shots/t02-unverified.png')
        # verify via link, then reuse link -> error + resend
        link=link_from_log(); await pg.goto(link); await pg.wait_for_selector('text=Email verified'); await pg.screenshot(path='e2e/shots/t03-verified.png')
        await pg.goto(link); await pg.wait_for_selector('text=Expired or invalid link')
        await pg.click('button:has-text("Continue")') if await pg.locator('button:has-text("Continue")').count() else None
        await pg.goto(B+'/login'); await pg.fill('input[type=email] >> nth=0', email); await pg.fill('input[type=password]', 'password123')
        await pg.click('button:has-text("Log in")'); await pg.wait_for_selector('text=No teams yet')
        await pg.screenshot(path='e2e/shots/t04-empty-board.png')
        # teams
        await pg.click('a.navlink:has-text("Teams")'); await pg.click('button:has-text("Create team")')
        await pg.fill('.modal input', 'Payments Team'); await pg.click('.modal button:has-text("Create")')
        await pg.wait_for_selector('td:has-text("Payments Team")')
        await pg.click('button:has-text("Create team")'); await pg.fill('.modal input', 'payments team'); await pg.click('.modal button:has-text("Create")')
        await pg.wait_for_selector('.modal .error-box'); await pg.click('.modal button:has-text("Cancel")')
        await pg.click('button:has-text("Create team")'); await pg.fill('.modal input', 'Internal Tools'); await pg.click('.modal button:has-text("Create")')
        # epics
        await pg.click('a.navlink:has-text("Epics")'); await pg.wait_for_selector('select')
        await pg.select_option('select', label='Payments Team')
        await pg.click('button:has-text("Create epic")'); await pg.fill('form input', 'Checkout'); await pg.click('form button:has-text("Save")')
        await pg.wait_for_selector('td:has-text("Checkout")')
        # tickets
        await pg.click('a.navlink:has-text("Board")'); await pg.wait_for_selector('.board')
        await pg.select_option('select[aria-label=Team]', label='Payments Team')
        titles=[('Payment fails for expired card','bug'),('Add retry configuration','feature'),('Fix rounding','fix')]
        for t,ty in titles:
            await pg.click('button:has-text("New ticket")'); await pg.wait_for_selector('#ticket-form')
            await pg.select_option('#ticket-form select >> nth=0', label='Payments Team')
            await pg.select_option('#ticket-form select >> nth=1', value=ty)
            await pg.select_option('#ticket-form select >> nth=3', label='Checkout')
            await pg.fill('#ticket-form input', t); await pg.fill('#ticket-form textarea', 'Steps to reproduce: ...')
            await pg.click('button:has-text("Create")'); await pg.wait_for_selector('text=Created by')
            await pg.click('a.back')
            await pg.wait_for_selector('.board')
        await pg.screenshot(path='e2e/shots/t05-board.png')
        # drag card 1 to In progress
        card=pg.locator('article:has-text("Payment fails")'); target=pg.locator('section[data-state=in_progress]')
        await card.drag_to(target)
        await pg.wait_for_selector('section[data-state=in_progress] >> text=Payment fails')
        await pg.reload(); await pg.wait_for_selector('section[data-state=in_progress] >> text=Payment fails')
        print('drag persisted after reload: OK')
        # failed drop rolls back: make PATCH fail
        await pg.route('**/api/tickets/*', lambda route: route.fulfill(status=500, content_type='application/json', body='{"error":"boom"}') if route.request.method=='PATCH' else route.continue_())
        await pg.locator('article:has-text("Add retry")').drag_to(pg.locator('section[data-state=done]'))
        await pg.wait_for_selector('.toast.error'); await pg.wait_for_selector('section[data-state=new] >> text=Add retry')
        print('failed drop reverted + error shown: OK'); await pg.unroute('**/api/tickets/*')
        # filters
        await pg.fill('input[placeholder="Search title…"]', 'RETRY'); await pg.wait_for_selector('text=1 of 3 tickets')
        await pg.select_option('.filters select >> nth=0', value='bug'); await pg.wait_for_selector('text=0 of 3 tickets')
        await pg.click('button:has-text("Clear")'); await pg.wait_for_selector('text=3 tickets')
        # open ticket, comment, delete protections
        await pg.click('a:has-text("Payment fails")'); await pg.wait_for_selector('text=Comments')
        await pg.fill('textarea[placeholder="Write a comment…"]', 'Reproduced in Chrome.'); await pg.click('button:has-text("Post comment")')
        await pg.wait_for_selector('.comment:has-text("Reproduced in Chrome.")'); await pg.screenshot(path='e2e/shots/t06-ticket.png')
        await pg.click('a.back'); await pg.click('a.navlink:has-text("Teams")'); await pg.wait_for_selector('td:has-text("Payments Team")')
        await pg.click('tr:has-text("Payments Team") button:has-text("Delete")')
        await pg.wait_for_selector('.toast.error'); print('team delete blocked with message: OK')
        await pg.screenshot(path='e2e/shots/t07-teams.png')
        await pg.click('a.navlink:has-text("Epics")'); await pg.select_option('select', label='Payments Team'); await pg.wait_for_selector('td:has-text("Checkout")')
        await pg.click('tr:has-text("Checkout") button[aria-label^="Delete epic"]')
        await pg.wait_for_selector('.toast.error'); print('epic delete blocked with message: OK')
        await pg.screenshot(path='e2e/shots/t08-epics.png')
        # logout
        await pg.click('.user-btn'); await pg.click('text=Log out'); await pg.wait_for_selector('text=Use your verified account')
        await br.close()
asyncio.run(main()); print('ERRORS:', errors)
