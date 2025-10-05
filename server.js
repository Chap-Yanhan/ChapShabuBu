// server.js (เวอร์ชันแก้ไข Race Condition ฝั่ง Google Sheets - Final Fix V2: Batch Deletion Logic)

// --- [เพิ่ม] การ import สำหรับ WebSocket ---
const http = require('http');
const { WebSocketServer } = require('ws');

const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const session = require('express-session');
const { Pool } = require('pg');
const cloudinary = require('cloudinary').v2;
require('dotenv').config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
const serviceAccountAuth = new JWT({
  email: creds.client_email,
  key: creds.private_key,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const doc = new GoogleSpreadsheet('1kmF_DEUrOsUIlqoADw4WWp5E8ApmMRWtHP1wqK9sEoM', serviceAccountAuth); // ❗️ อย่าลืมเปลี่ยนเป็น Sheet ID ใหม่ของคุณ

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const app = express();
const PORT = process.env.PORT || 3000;

// --- [เพิ่ม] สร้าง HTTP Server และ WebSocket Server ---
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const clients = new Set();

wss.on('connection', (ws) => {
  console.log('Client connected via WebSocket');
  clients.add(ws);
  ws.on('close', () => {
    console.log('Client disconnected');
    clients.delete(ws);
  });
});

function broadcast(data) {
  const message = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === client.OPEN) {
      client.send(message);
    }
  }
}

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.use(session({
  secret: 'your_super_secret_key_for_session_shabu',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 3600000 }
}));

let orders = [];
let tableClearanceTimestamps = {};

async function setupDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS menu (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        category VARCHAR(50) NOT NULL,
        image VARCHAR(255),
        is_available BOOLEAN DEFAULT TRUE
      );
    `);
    
    const res = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='menu' AND column_name='is_available'");
    if (res.rowCount === 0) {
      await client.query('ALTER TABLE menu ADD COLUMN is_available BOOLEAN DEFAULT TRUE');
      console.log('Added "is_available" column to "menu" table.');
    }
    
    console.log('Database table "menu" is ready.');
  } catch (err) {
    console.error('Error setting up database table:', err);
  } finally {
    client.release();
  }
}
setupDatabase();

async function logDailySalesToSheet(orderData) {
  try {
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];
    const { id: orderId, table, items, time, status } = orderData; 
    const menuResult = await pool.query('SELECT name, category FROM menu'); 
    const menuMap = new Map(menuResult.rows.map(item => [item.name, item.category])); 
    const orderTimeUTC = new Date(time); 
    orderTimeUTC.setHours(orderTimeUTC.getUTCHours() + 7); 
    const formattedTimestamp = orderTimeUTC.toLocaleString('th-TH', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    for (const [itemName, quantity] of Object.entries(items)) { 
      const category = menuMap.get(itemName) || 'Unknown'; 
      await sheet.addRow({ Timestamp: formattedTimestamp, Table: table, 'Order ID': orderId, Status: status, MenuItem: itemName, Category: category, Quantity: quantity });
    }
    console.log('Order logged to Google Sheet successfully with flat structure.');
  } catch (error) {
    console.error('Error logging order to Google Sheets:', error); 
  }
}

// --- [แก้ไข/เปลี่ยน] ฟังก์ชันสำหรับลบรายการอาหารออกจาก Google Sheet ด้วย Batch Logic (แก้ไข Range not found) ---
async function batchDeleteItemFromGoogleSheet(itemsToDelete) {
  try {
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0]; 
    
    // 1. ดึงแถวทั้งหมด
    const rows = await sheet.getRows(); 
    
    // 2. ค้นหา **Array Index** (0-based) ของแถวที่ต้องการลบ
    const rowsToDeleteArrayIndexes = [];
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const orderId = row.get('Order ID');
      const menuItem = row.get('MenuItem');
      
      const foundMatch = itemsToDelete.some(item => 
        item.orderId === String(orderId) && item.menuItemName === menuItem
      );

      if (foundMatch) {
        // เก็บ **Array Index** (i) ซึ่งเป็น 0-based
        rowsToDeleteArrayIndexes.push(i); 
      }
    }

    if (rowsToDeleteArrayIndexes.length === 0) {
      console.log('[Google Sheet] No rows found to delete in batch.');
      return;
    }
    
    // 3. เรียงลำดับ Array Index จากมากไปน้อย (**ลบจากล่างขึ้นบน**)
    rowsToDeleteArrayIndexes.sort((a, b) => b - a);

    // 4. ลบทีละแถวตามลำดับย้อนกลับ
    for (const arrayIndex of rowsToDeleteArrayIndexes) {
      // ใช้ row.delete() บน Object แถวโดยตรง ซึ่งเสถียรที่สุดในการลบแบบเรียงลำดับ
      await rows[arrayIndex].delete(); 
      console.log(`[Google Sheet] Sequentially deleted Array Index ${arrayIndex} (Sheet Row: ${arrayIndex + 2}) in batch cleanup.`);
    }
    
    console.log(`[Google Sheet] Successfully performed batch deletion of ${rowsToDeleteArrayIndexes.length} items.`);
  } catch (error) {
    console.error('[Google Sheet] Error during batch deletion:', error.message);
    // re-throw error เพื่อให้ Background Task รับรู้ความล้มเหลว
    throw error; 
  }
}
// -----------------------------------------------------------

function isAuthenticated(req, res, next) {
  if (req.session.isAuthenticated) { return next(); }
  res.redirect('/admin_login.html');
}
app.get('/kitchen.html', isAuthenticated, (req, res) => { res.sendFile(path.join(__dirname, 'kitchen.html')); });
app.get('/history.html', isAuthenticated, (req, res) => { res.sendFile(path.join(__dirname, 'history.html')); });
app.use(express.static(__dirname));

app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'chap' && password === '123456') {
    req.session.isAuthenticated = true;
    res.json({ success: true, message: 'Login successful' });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

app.get('/admin/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) { return res.status(500).json({ success: false, message: 'Could not log out.' }); }
    res.json({ success: true, message: 'Logged out successfully.' });
  });
});

app.get('/admin/check-auth', (req, res) => {
  res.json({ isAuthenticated: !!req.session.isAuthenticated });
});

app.post('/orders', async (req, res) => {
  const { table, items } = req.body;
  if (!table || !items || typeof items !== 'object' || Object.keys(items).length === 0) {
    return res.status(400).json({ error: 'ข้อมูลออเดอร์ไม่ครบถ้วน' });
  }

  try {
    const itemNames = Object.keys(items);
    
    const stockCheckQuery = await pool.query(
      'SELECT name, is_available FROM menu WHERE name = ANY($1::text[])',
      [itemNames]
    );

    for (const itemName of itemNames) {
        const itemStatus = stockCheckQuery.rows.find(row => row.name === itemName);
        if (!itemStatus || !itemStatus.is_available) {
            return res.status(400).json({ 
                error: `ขออภัย, เมนู "${itemName}" หมดสต็อกแล้ว กรุณาลองใหม่อีกครั้ง` 
            });
        }
    }
  } catch(dbError) {
      console.error("Database error during stock check:", dbError);
      return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการตรวจสอบสต็อก' });
  }

  const now = new Date();
  const order = { id: 'order_' + now.getTime(), table, items, time: now.toISOString(), status: 'pending' };
  orders.push(order);
  logDailySalesToSheet(order);
  res.json({ success: true, order });
});

app.get('/orders', (req, res) => {
    const { status, table } = req.query;
    let result = orders;
    if (status) result = result.filter(o => o.status === status);
    if (table) result = result.filter(o => o.table === table);
    result = result.sort((a, b) => new Date(b.time) - new Date(a.time));
    res.json(result);
});

app.put('/orders/:id', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const idx = orders.findIndex(o => o.id === id);
    if (idx === -1) {
        return res.status(404).json({ error: 'ไม่พบออเดอร์' });
    }
    const oldStatus = orders[idx].status;
    if (status && status !== oldStatus) {
        orders[idx].status = status;
        res.json({ success: true, order: orders[idx] }); 
        (async () => { // **[ใหม่]** เปลี่ยนเป็น Background Task
            try {
                await doc.loadInfo();
                const sheet = doc.sheetsByIndex[0];
                const rows = await sheet.getRows(); 
                const rowsToUpdate = rows.filter(row => row.get('Order ID') === id);
                for (const row of rowsToUpdate) {
                    if (row.get('Status') !== status) { 
                        row.set('Status', status);
                        await row.save();
                    }
                }
                console.log(`Status for Order ID ${id} updated to ${status} in Google Sheet successfully (background task).`);
            } catch (error) {
                console.error('Error updating status in Google Sheet (background task):', error);
            }
        })();
    } else {
        res.json({ success: true, order: orders[idx] });
    }
});

app.delete('/orders', (req, res) => {
    const { table, status } = req.query;
    if (!table || !status) return res.status(400).json({ error: 'ต้องระบุ table และ status' });
    const before = orders.length;
    orders = orders.filter(o => !(o.table === table && o.status === status));
    tableClearanceTimestamps[table] = new Date().getTime();
    console.log(`Table ${table} cleared at ${new Date(tableClearanceTimestamps[table]).toLocaleTimeString()}`);
    res.json({ success: true, deleted: before - orders.length });
});

app.get('/orders/by-table', (req, res) => {
    const { table } = req.query;
    if (!table) {
        return res.status(400).json({ error: 'Table number is required' });
    }
    const lastClearTimestamp = tableClearanceTimestamps[table] || 0;
    const sessionOrders = orders.filter(order => 
        order.table === table && new Date(order.time).getTime() > lastClearTimestamp
    );
    res.json(sessionOrders);
});

app.get('/api/menu', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM menu ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/menu/:id/toggle-availability', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  try {
    // [แก้ไข] เปลี่ยน RETURNING เพื่อดึงข้อมูลทั้งหมด (รวมถึง 'name')
    const result = await pool.query(
      'UPDATE menu SET is_available = NOT is_available WHERE id = $1 RETURNING *',
      [id]
    );
    if (result.rowCount > 0) {
      const updatedItem = result.rows[0];
        
      // --- [ใหม่] Logic จัดการออเดอร์ที่ค้างอยู่ เมื่อเมนูเป็นของหมด (is_available = false) ---
      if (updatedItem.is_available === false) { 
          const menuName = updatedItem.name;
          
          // กรองออเดอร์ที่ 'pending' และมีรายการอาหารที่เพิ่งหมดสต็อก
          const ordersToProcess = orders.filter(o => 
              o.status === 'pending' && o.items[menuName]
          );

          // [แก้ไข] เตรียม Array สำหรับเก็บรายการที่จะถูกลบออกจาก Google Sheet
          const itemsToDeleteFromSheet = [];

          for (const order of ordersToProcess) {
              const orderId = order.id;
              
              // 1. เพิ่มรายการที่ต้องลบเข้าใน Batch Array
              itemsToDeleteFromSheet.push({ orderId, menuItemName: menuName });

              // 2. ลบรายการอาหารออกจาก Object ใน memory (ทำทันที)
              delete order.items[menuName]; 
              
              // 3. ตรวจสอบสถานะออเดอร์หลังลบ (ทำทันทีและ Broadcast ทันที)
              if (Object.keys(order.items).length === 0) {
                  // ออเดอร์ว่างเปล่า, ลบทิ้งจาก orders array ใน memory
                  const idx = orders.findIndex(o => o.id === orderId);
                  if (idx > -1) {
                      orders.splice(idx, 1);
                  }

                  // ส่งสัญญาณลบออเดอร์
                  broadcast({ type: 'ORDER_DELETED', payload: { id: orderId } });
                  console.log(`[Order Adjusted] Order ${orderId} deleted (all items were the removed menu).`);
              } else {
                  // ยังเหลือรายการอื่น, ส่งสัญญาณอัปเดต
                  broadcast({ type: 'ORDER_UPDATED', payload: order });
                  console.log(`[Order Adjusted] Order ${orderId} updated, removed item: ${menuName}.`);
              }
          }

          // [แก้ไข: Final Fix V2] เริ่ม Background Task สำหรับการลบแบบ Batch
          if (itemsToDeleteFromSheet.length > 0) {
              (async () => {
                  try {
                      // เรียกใช้ฟังก์ชัน Batch เพียงครั้งเดียว (ภายในมีการลบแบบ Reverse Sequential)
                      await batchDeleteItemFromGoogleSheet(itemsToDeleteFromSheet);
                      console.log('[Google Sheet Cleanup] Finished batch background deletion.');
                  } catch (e) {
                      console.error('Google Sheet batch deletion background task failed:', e);
                  }
              })();
          }
          
      }
      // -----------------------------------------------------------------------------------------

      // [แก้ไข] Broadcast สถานะเมนูใหม่ (เพิ่ม name ใน payload)
      broadcast({
        type: 'MENU_STATUS_UPDATE',
        payload: { 
            id: updatedItem.id, 
            is_available: updatedItem.is_available, 
            name: updatedItem.name 
        }
      });
      
      // ส่ง Response กลับไปให้ Client ทันทีโดยไม่ต้องรอ Google Sheet
      res.json({ success: true, item: updatedItem });
      
    } else {
      res.status(404).json({ error: 'ไม่พบเมนู' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/menu', isAuthenticated, upload.single('image'), async (req, res) => {
  const { name, category } = req.body;
  if (!name || !category) {
    return res.status(400).json({ error: 'ต้องระบุชื่อและหมวดหมู่' });
  }
  let imageUrl = '';
  try {
    if (req.file) {
      const b64 = Buffer.from(req.file.buffer).toString("base64");
      let dataURI = "data:" + req.file.mimetype + ";base64," + b64;
      const result = await cloudinary.uploader.upload(dataURI, { folder: "shabu-menu" });
      imageUrl = result.secure_url;
    }
    const id = 'menu_' + Date.now();
    const dbResult = await pool.query( 'INSERT INTO menu (id, name, category, image) VALUES ($1, $2, $3, $4) RETURNING *', [id, name, category, imageUrl] );
    
    // --- [แก้ไข] เพิ่มการ broadcast เมื่อสร้างเมนูใหม่ ---
    broadcast({
      type: 'MENU_ITEM_ADDED',
      payload: dbResult.rows[0]
    });
    
    res.status(201).json({ success: true, item: dbResult.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Cloudinary or Database error' });
  }
});

app.put('/api/menu/:id', isAuthenticated, upload.single('image'), async (req, res) => {
  const { id } = req.params;
  const { name, category } = req.body;
  try {
    const oldData = await pool.query('SELECT image FROM menu WHERE id = $1', [id]);
    if (oldData.rowCount === 0) {
      return res.status(404).json({ error: 'ไม่พบเมนู' });
    }
    let imageUrl = oldData.rows[0].image;
    if (req.file) {
      if (imageUrl) {
        const publicIdWithFolder = imageUrl.substring(imageUrl.indexOf('shabu-menu/'));
        const publicId = publicIdWithFolder.substring(0, publicIdWithFolder.lastIndexOf('.'));
        await cloudinary.uploader.destroy(publicId);
      }
      const b64 = Buffer.from(req.file.buffer).toString("base64");
      let dataURI = "data:" + req.file.mimetype + ";base64," + b64;
      const newImageResult = await cloudinary.uploader.upload(dataURI, { folder: "shabu-menu" });
      imageUrl = newImageResult.secure_url;
    }
    const result = await pool.query( 'UPDATE menu SET name = $1, category = $2, image = $3 WHERE id = $4 RETURNING *', [name, category, imageUrl, id] );
    
    // --- [แก้ไข] เพิ่มการ broadcast เมื่อแก้ไขเมนู ---
    broadcast({
      type: 'MENU_ITEM_UPDATED',
      payload: result.rows[0]
    });
    
    res.json({ success: true, item: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Cloudinary or Database error' });
  }
});

app.delete('/api/menu/:id', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM menu WHERE id = $1 RETURNING image', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'ไม่พบเมนู' });
    }
    const imageToDelete = result.rows[0].image;
    if (imageToDelete) {
      const publicIdWithFolder = imageToDelete.substring(imageToDelete.indexOf('shabu-menu/'));
      const publicId = publicIdWithFolder.substring(0, publicIdWithFolder.lastIndexOf('.'));
      await cloudinary.uploader.destroy(publicId);
    }

    // --- [แก้ไข] เพิ่มการ broadcast เมื่อลบเมนู ---
    broadcast({
      type: 'MENU_ITEM_DELETED',
      payload: { id: id } // ส่งแค่ id กลับไปก็พอ
    });

    res.json({ success: true, message: 'ลบเมนูสำเร็จ' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Cloudinary or Database error' });
  }
});

server.listen(PORT, () => {
  console.log(`Shabu Order Backend running on port ${PORT}`);
});


