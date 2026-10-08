# Ajwa Shinas Al Safia Trading - POS

Invoicing / point of sale for a customs-clearance and logistics office.
Plain HTML + CSS + JavaScript on the front, one small PHP file on the back (`api/index.php`),
SQLite database in `data/`. No Firebase, no MySQL, nothing to install.

Arabic (default) and English, right-to-left. Built for a PC; phone view is for checking numbers.

```
index.html          the app
css/  js/  img/     styles, scripts, logo
api/index.php       the server (login, saving, invoice numbers)
data/               the database lives here - never uploaded to GitHub
.htaccess           Hostinger settings (compression, caching, security headers)
```

## Try it locally (demo mode)

Open `index.html` in a browser. With no PHP present it runs in **demo mode**: sample customers and
invoices are pre-loaded and everything is saved in that browser only. Use this to show the customer.

To run the real thing on your PC (needs PHP 8.1+):

```
php -S 127.0.0.1:8080
```
then open http://127.0.0.1:8080 - the first visit asks you to create the owner account.

## Put it live on Hostinger

1. Push this folder to GitHub (the `.gitignore` already keeps `data/` out).
2. hPanel -> **Websites -> Git** -> connect the repo, branch `main`, install path `public_html`
   (or the domain's folder). Turn on auto-deploy if you want every push to go live.
3. hPanel -> **Advanced -> PHP Configuration**: choose **PHP 8.1 or newer** and make sure
   `pdo_sqlite` is ticked.
4. Open the site. The first screen asks for the **owner account** - the customer chooses the
   username and a password (8+ characters). It only appears once.
5. **Check the database is private** - open `https://YOUR-DOMAIN/data/ajwa-pos.sqlite`.
   It must show *403 Forbidden* or *404*. If it downloads a file, stop and tell me.
6. Once the SSL certificate shows Active (hPanel -> Security -> SSL), open `.htaccess` and
   remove the `#` in front of the three HTTPS-redirect lines.
7. Settings screen -> **Delete all invoices & customers** (choose "start numbering from 1") to
   clear anything left from the demo, then enter the real business details and prices.

If saving fails with "data folder not writable": File Manager -> `data` folder -> permissions 755
(or 775).

## Day to day

- **Owner (admin)** sees everything. **Cashier** logins (Settings -> Staff logins) can create
  invoices, receive payments and manage customers - nothing else. The server enforces this.
- Invoice numbers (`INV-00001...`) are given by the server, never repeat, and an invoice is
  *voided*, not deleted, so there are no gaps.
- **Back up**: Settings -> *Download backup* regularly. Hostinger's own backups also cover the
  `data/` folder.
- Government fees paid for the customer (customs duty, permits, food-control fees) are marked
  **"paid on behalf"**: charged at cost, no VAT. Office services (commission, weighbridge,
  logistics) carry VAT only when the business is VAT-registered (Settings switch).
  Have the customer's accountant confirm this treatment.

## Updating

Change files, `git push`. The database and logins are untouched because `data/` is not in Git.
