const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { randomUUID: uuidv4 } = require('crypto');
const puppeteer = require('puppeteer');

const app = express();
const PORT = 3000;

// Baza de date
const db = new Database('./data/menu.db');

// Creăm tabelul dacă nu există
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    volumes TEXT,
    image TEXT,
    price1 REAL DEFAULT 0,
    price2 REAL DEFAULT 0,
    volumes2 TEXT,
    price1_size2 REAL DEFAULT 0,
    price2_size2 REAL DEFAULT 0,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

try {
  db.exec(`ALTER TABLE products ADD COLUMN volumes2 TEXT;`);
  db.exec(`ALTER TABLE products ADD COLUMN price1_size2 REAL DEFAULT 0;`);
  db.exec(`ALTER TABLE products ADD COLUMN price2_size2 REAL DEFAULT 0;`);
} catch (e) {}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Configurare upload poze
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueName = uuidv4() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });

// Rute
app.get('/', (req, res) => {
  res.redirect('/partener');
});

app.get('/admin', (req, res) => {
  const products = db.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
  res.render('admin', { products });
});

app.post('/admin/add', upload.single('image'), (req, res) => {
  const { 
    name, category, volumes, price1, price2, 
    volumes2, price1_size2, price2_size2, description 
  } = req.body;
  
  const id = uuidv4();
  const image = req.file ? '/uploads/' + req.file.filename : null;

  db.prepare(`
    INSERT INTO products (
      id, name, category, volumes, image, price1, price2, 
      volumes2, price1_size2, price2_size2, description
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, name, category || 'General', volumes || '', image, 
    price1 || 0, price2 || 0, volumes2 || '', 
    price1_size2 || 0, price2_size2 || 0, description || ''
  );

  res.redirect('/admin');
});

app.post('/admin/delete/:id', (req, res) => {
  const product = db.prepare('SELECT image FROM products WHERE id = ?').get(req.params.id);
  if (product && product.image) {
    const cleanImgPath = product.image.startsWith('/') ? product.image.substring(1) : product.image;
    const imagePath = path.join(__dirname, 'public', cleanImgPath);
    if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
  }
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.redirect('/admin');
});

app.get('/partener', (req, res) => {
  const products = db.prepare('SELECT * FROM products ORDER BY category, name').all();
  res.render('partener', { products });
});

// Generare PNG
app.post('/generate-pdf', async (req, res) => {
  let selected = [];
  try {
    selected = typeof req.body.selected === 'string' 
      ? JSON.parse(req.body.selected || '[]') 
      : (req.body.selected || []);
  } catch (err) {
    return res.status(400).send('Date invalide primite.');
  }

  const categoryTitle = (selected.length > 0 && selected[0].category) 
    ? selected[0].category.toUpperCase() 
    : 'MENIU BĂUTURI';

  try {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });

    const fontPath = path.join(__dirname, 'public', 'dr-agu-sans-bold.ttf');
    let fontBase64 = '';
    if (fs.existsSync(fontPath)) {
      const fontBitmap = fs.readFileSync(fontPath);
      fontBase64 = `data:font/ttf;base64,${fontBitmap.toString('base64')}`;
    }

    const headerPatternPath = path.join(__dirname, 'public', 'header-pattern.png');
    let headerPatternBase64 = '';
    if (fs.existsSync(headerPatternPath)) {
      const patternBitmap = fs.readFileSync(headerPatternPath);
      headerPatternBase64 = `data:image/png;base64,${patternBitmap.toString('base64')}`;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="ro">
      <head>
        <meta charset="UTF-8">
        <style>
          @font-face {
            font-family: 'BrandBold';
            src: url('${fontBase64}') format('truetype');
          }
          body {
            background-color: #000000;
            color: #ffffff;
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 30px 40px;
            box-sizing: border-box;
            width: 794px;
            min-height: 1123px;
            position: relative;
          }
          .header-container {
            position: relative;
            width: 100%;
            height: 75px;
            margin-bottom: 25px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .header-pattern {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 75px;
            object-fit: cover;
          }
          .title {
            position: relative;
            z-index: 2;
            font-family: 'BrandBold', Arial, sans-serif;
            font-size: 22px;
            text-align: center;
            color: #ffffff;
            letter-spacing: 1px;
            text-shadow: 0 2px 4px rgba(0,0,0,0.8);
          }
          .columns-header {
            display: flex;
            justify-content: flex-end;
            gap: 35px;
            padding-right: 25px;
            font-family: 'BrandBold', Arial, sans-serif;
            color: #e38200;
            font-size: 11px;
            text-align: center;
            margin-bottom: 15px;
            line-height: 1.2;
          }
          .col-title {
            width: 95px;
            text-align: right;
          }
          .product-row {
            display: flex;
            align-items: center;
            height: 78px;
            margin-bottom: 10px;
          }
          .product-img-container {
            width: 60px;
            height: 60px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-right: 15px;
            flex-shrink: 0;
          }
          .product-img {
            width: 100%;
            height: 100%;
            object-fit: contain;
            display: block;
          }
          .product-info {
            flex-grow: 1;
            display: flex;
            align-items: baseline;
          }
          .product-name {
            font-family: 'BrandBold', Arial, sans-serif;
            font-size: 20px;
            color: #ffffff;
            width: 160px;
          }
          .product-volume {
            font-family: Arial, sans-serif;
            font-size: 14px;
            color: #ffffff;
            margin-left: 20px;
          }
          .prices {
            display: flex;
            gap: 35px;
            width: 225px;
            justify-content: flex-end;
            padding-right: 25px;
          }
          .price-box {
            width: 95px;
            text-align: right;
            font-family: 'BrandBold', Arial, sans-serif;
            font-size: 24px;
            color: #ffffff;
          }
          .price-box span {
            font-size: 12px;
            font-family: Arial, sans-serif;
          }
          .footer {
            position: absolute;
            bottom: 35px;
            left: 0;
            width: 100%;
            text-align: center;
          }
          .footer-top {
            font-family: 'BrandBold', Arial, sans-serif;
            color: #e38200;
            font-size: 9px;
            margin-bottom: 4px;
          }
          .footer-mid {
            color: #ffffff;
            font-size: 8px;
            margin-bottom: 4px;
          }
          .footer-bot {
            color: #aaaaaa;
            font-size: 7px;
            padding: 0 20px;
          }
        </style>
      </head>
      <body>
        <div class="header-container">
          ${headerPatternBase64 ? `<img src="${headerPatternBase64}" class="header-pattern" />` : ''}
          <div class="title">${categoryTitle}</div>
        </div>
        
        <div class="columns-header">
          <div class="col-title">Tucano<br>Blend</div>
          <div class="col-title">Ethiopia</div>
        </div>

        <div class="products-list">
          ${selected.map(item => {
            let itemImgBase64 = '';
            if (item.image) {
              const cleanPath = item.image.startsWith('/') ? item.image.substring(1) : item.image;
              const fullImgPath = path.join(__dirname, 'public', cleanPath);
              if (fs.existsSync(fullImgPath)) {
                const imgBitmap = fs.readFileSync(fullImgPath);
                const ext = path.extname(item.image).substring(1);
                itemImgBase64 = `data:image/${ext};base64,${imgBitmap.toString('base64')}`;
              }
            }

            return `
              <div class="product-row">
                <div class="product-img-container">
                  ${itemImgBase64 ? `<img src="${itemImgBase64}" class="product-img" />` : ''}
                </div>
                <div class="product-info">
                  <div class="product-name">${item.name || ''}</div>
                  <div class="product-volume">${item.volumes || ''}</div>
                </div>
                <div class="prices">
                  <div class="price-box">
                    ${item.price1 ? `${item.price1} <span>lei</span>` : ''}
                  </div>
                  <div class="price-box">
                    ${item.price2 ? `${item.price2} <span>lei</span>` : ''}
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <div class="footer">
          <div class="footer-top">100% Specialty Arabica</div>
          <div class="footer-mid">Alternative vegetale + 3 Lei &nbsp;|&nbsp; Extra sirop 10 ml + 3 Lei</div>
          <div class="footer-bot">Imagini și informații cu titlu de prezentare &nbsp;|&nbsp; Pentru valori nutriționale și ingrediente, consultă codul QR de pe vitrină &nbsp;|&nbsp; Prețurile sunt indicate în lei, TVA inclus</div>
        </div>
      </body>
      </html>
    `;

    await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });

    const imageBuffer = await page.screenshot({ type: 'png', fullPage: true });
    await browser.close();

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename=meniu-${categoryTitle.toLowerCase().replace(/\s+/g, '-')}.png`);
    res.send(imageBuffer);

  } catch (error) {
    console.error('Eroare detaliată la generarea PNG:', error);
    res.status(500).send('Eroare la generarea imaginii: ' + error.message);
  }
});

app.listen(PORT, () => {
  console.log('Server pornit: http://localhost:3000');
});
