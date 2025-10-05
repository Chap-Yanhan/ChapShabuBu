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
const doc = new GoogleSpreadsheet('1md973ZA2pfD4GZeZw5LdsCrDw1p4Uo-iph7Mc1_oeRc', serviceAccountAuth);


// ----------------------------------------------------------------------
// --- [ใหม่] ฟังก์ชันสำหรับบันทึกออเดอร์ลง Google Sheet ---
// ----------------------------------------------------------------------
async function logOrderToSheet(orderId, tableNumber, items) {
  try {
    // ใช้ loadInfo เพื่อให้มั่นใจว่าข้อมูลชีตล่าสุด
    await doc.loadInfo(); 
    const sheet = doc.sheetsByIndex[0]; // สมมติว่าชีตแรกคือชีตสำหรับออเดอร์
    
    // เตรียมแถวข้อมูลสำหรับแต่ละรายการในออเดอร์
    const rows = Object.entries(items).map(([name, qty]) => ({
      Timestamp: new Date().toLocaleString('th-TH'),
      OrderId: orderId.toString(), // แปลง OrderId เป็น String เพื่อความชัวร์
      Table: tableNumber.toString(), // แปลง Table Number เป็น String
      MenuItem: name,
      Quantity: qty,
      Status: 'pending' 
    }));

    if (rows.length > 0) {
      await sheet.addRows(rows);
      console.log(`✔️ Logged Order ${orderId} (Table ${tableNumber}) to Google Sheet.`);
    }
  } catch (error) {
    console.error('❌ Error logging order to Google Sheet:', error.message);
    // ไม่ต้อง throw error ออกไป เพราะถึงแม้จะบันทึกใน Sheet ไม่ได้ แต่ออเดอร์ยังอยู่ใน DB
  }
}

// ----------------------------------------------------------------------
// --- ส่วนของ Database และ Middleware อื่นๆ (เดิม) ---
// ----------------------------------------------------------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // สำหรับการเชื่อมต่อกับ Heroku/Render
  },
});

// ตรวจสอบการเชื่อมต่อ
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Error connecting to the database', err.stack);
  } else {
    console.log('Database connected successfully:', res.rows[0].now);
  }
});

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));
app.use(express.json());

// ตั้งค่า Multer สำหรับการอัปโหลดไฟล์ (ใช้สำหรับเมนู)
const upload = multer({ 
  storage: multer.memoryStorage(),
});

// ตั้งค่า Session (ใช้สำหรับ Admin Login)
app.use(session({
  secret: process.env.SESSION_SECRET || 'a-very-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { 
    secure: process.env.NODE_ENV === 'production', // ใช้ true ใน production (HTTPS)
    maxAge: 24 * 60 * 60 * 1000 // 24 ชั่วโมง
  }
}));

// Middleware ตรวจสอบสิทธิ์ Admin
const isAuthenticated = (req, res, next) => {
  if (req.session.isAdmin) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

// ----------------------------------------------------------------------
// --- ส่วนของ WebSocket Setup (เดิม) ---
// ----------------------------------------------------------------------
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const wsClients = [];

wss.on('connection', (ws) => {
  wsClients.push(ws);
  console.log('New client connected via WebSocket. Total clients:', wsClients.length);

  ws.on('close', () => {
    const index = wsClients.indexOf(ws);
    if (index > -1) {
      wsClients.splice(index, 1);
    }
    console.log('Client disconnected. Total clients:', wsClients.length);
  });
});

// ฟังก์ชันสำหรับส่งข้อมูลไปยังทุก Client ที่เชื่อมต่ออยู่
function broadcast(data) {
  const message = JSON.stringify(data);
  wsClients.forEach(client => {
    if (client.readyState === client.OPEN) {
      client.send(message);
    }
  });
}

// ----------------------------------------------------------------------
// --- ส่วนของ Static Files (เดิม) ---
// ----------------------------------------------------------------------
app.use(express.static(path.join(__dirname)));


// ----------------------------------------------------------------------
// --- ส่วนของ Admin Login/Logout API (เดิม) ---
// ----------------------------------------------------------------------
// ... (โค้ดส่วน Admin Login/Logout เดิม)
app.post('/admin/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.json({ success: true, message: 'Login successful' });
  }
  res.status(401).json({ success: false, message: 'ID หรือรหัสผ่านไม่ถูกต้อง' });
});

app.get('/admin/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Could not log out' });
    }
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

// ตรวจสอบสถานะการล็อกอิน
app.get('/admin/status', (req, res) => {
  if (req.session.isAdmin) {
    res.json({ isLoggedIn: true });
  } else {
    res.json({ isLoggedIn: false });
  }
});

// ----------------------------------------------------------------------
// --- ส่วนของ Menu API (เดิม) ---
// ----------------------------------------------------------------------
// GET /api/menu: ดึงรายการเมนูทั้งหมด
app.get('/api/menu', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM menu ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/menu: เพิ่มเมนูใหม่ (Admin only)
app.post('/api/menu', isAuthenticated, upload.single('image'), async (req, res) => {
  const { name, category } = req.body;
  let imageUrl = null;
  
  if (!name || !category) {
    return res.status(400).json({ error: 'Missing name or category' });
  }

  try {
    if (req.file) {
      const result = await cloudinary.uploader.upload(`data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`, {
        folder: 'shabumenu',
        resource_type: 'image'
      });
      imageUrl = result.secure_url;
    }

    const result = await pool.query(
      'INSERT INTO menu (name, category, image, is_available) VALUES ($1, $2, $3, TRUE) RETURNING *',
      [name, category, imageUrl]
    );
    
    // --- [แก้ไข] เพิ่มการ broadcast เมื่อเพิ่มเมนูใหม่ ---
    broadcast({
      type: 'MENU_ITEM_ADDED',
      payload: result.rows[0]
    });
    
    res.status(201).json({ success: true, item: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Cloudinary or Database error' });
  }
});

// PUT /api/menu/:id/toggle: เปลี่ยนสถานะพร้อมขาย (Admin only)
app.put('/api/menu/:id/toggle', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'UPDATE menu SET is_available = NOT is_available WHERE id = $1 RETURNING *',
      [id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'ไม่พบเมนู' });
    }
    
    // --- [แก้ไข] เพิ่มการ broadcast เมื่อเปลี่ยนสถานะเมนู ---
    broadcast({
      type: 'MENU_ITEM_TOGGLED',
      payload: result.rows[0]
    });
    
    res.json({ success: true, item: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PUT /api/menu/:id: แก้ไขเมนู (Admin only)
app.put('/api/menu/:id', isAuthenticated, upload.single('image'), async (req, res) => {
  const { id } = req.params;
  const { name, category, currentImage } = req.body;
  let imageUrl = currentImage;
  
  if (!name || !category) {
    return res.status(400).json({ error: 'Missing name or category' });
  }

  try {
    if (req.file) {
      // อัปโหลดรูปใหม่
      const result = await cloudinary.uploader.upload(`data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`, {
        folder: 'shabumenu',
        resource_type: 'image'
      });
      imageUrl = result.secure_url;

      // [Optional] ลบรูปเก่าใน Cloudinary
      if (currentImage) {
        const publicIdWithFolder = currentImage.substring(currentImage.lastIndexOf('/') + 1, currentImage.lastIndexOf('.'));
        await cloudinary.uploader.destroy(`shabumenu/${publicIdWithFolder}`);
      }
    }

    const result = await pool.query('UPDATE menu SET name = $1, category = $2, image = $3 WHERE id = $4 RETURNING *', [name, category, imageUrl, id] );
    
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
      const publicIdWithFolder = imageToDelete.substring(imageToDelete.lastIndexOf('/') + 1, imageToDelete.lastIndexOf('.'));
      await cloudinary.uploader.destroy(`shabumenu/${publicIdWithFolder}`);
    }
    
    // --- [แก้ไข] เพิ่มการ broadcast เมื่อลบเมนู ---
    broadcast({
      type: 'MENU_ITEM_DELETED',
      payload: { id: parseInt(id) } // ส่ง id กลับไปในรูปของตัวเลข (หรือ string ก็ได้ แล้วแต่ front-end จะจัดการ)
    });

    res.json({ success: true, message: 'Menu item deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database or Cloudinary error' });
  }
});

// ----------------------------------------------------------------------
// --- [ใหม่] ส่วนของ Order API ---
// ----------------------------------------------------------------------

// POST /api/orders: รับออเดอร์ใหม่
app.post('/api/orders', async (req, res) => {
  const { table, items } = req.body;
  
  if (!table || !items || Object.keys(items).length === 0) {
    return res.status(400).json({ error: 'Missing table number or order items' });
  }

  try {
    // 1. บันทึกออเดอร์ลง PostgreSQL
    // items จะถูกเก็บเป็น JSONB โดยอัตโนมัติ
    const result = await pool.query(
      'INSERT INTO orders (table_number, items, status) VALUES ($1, $2, $3) RETURNING *', 
      [table, items, 'pending']
    );
    const newOrder = result.rows[0];
    
    // 2. บันทึกออเดอร์ลง Google Sheet 
    // ใช้ await เพื่อรอให้บันทึกเสร็จก่อนตอบกลับ (เพิ่มความมั่นใจในการเก็บข้อมูล)
    await logOrderToSheet(newOrder.id, newOrder.table_number, newOrder.items); 

    // 3. Broadcast ออเดอร์ใหม่ไปห้องครัว
    broadcast({
      type: 'NEW_ORDER',
      payload: newOrder
    });

    res.status(201).json({ success: true, order: newOrder });
  } catch (err) {
    console.error('Error creating new order:', err);
    res.status(500).json({ error: 'Database or Sheet error' });
  }
});

// GET /api/orders: ดึงรายการออเดอร์
// รองรับ query params: ?table=X สำหรับ frontend status check, ?status=pending/done สำหรับ kitchen/history
app.get('/api/orders', async (req, res) => {
  const { table, status } = req.query;
  let query = 'SELECT * FROM orders';
  const values = [];
  const conditions = [];

  if (table) {
    conditions.push(`table_number = $${values.length + 1}`);
    values.push(table);
  }

  if (status) {
    conditions.push(`status = $${values.length + 1}`);
    values.push(status);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY created_at ASC'; // เรียงตามเวลาที่สร้าง

  try {
    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching orders:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PUT /api/orders/:id: อัปเดตสถานะออเดอร์ (ใช้โดยครัว)
app.put('/api/orders/:id', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // status: 'done', 'pending', etc.

  if (!status || !['done', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    // อัปเดตสถานะและบันทึกเวลาที่เสร็จสิ้น
    const result = await pool.query(
      'UPDATE orders SET status = $1, completed_at = NOW() WHERE id = $2 RETURNING *',
      [status, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    const updatedOrder = result.rows[0];
    
    // Broadcast การอัปเดตสถานะ (แจ้งทั้งหน้าครัวและหน้าสั่งอาหารของลูกค้า)
    broadcast({
      type: 'ORDER_STATUS_UPDATED',
      payload: updatedOrder
    });

    res.json({ success: true, order: updatedOrder });
  } catch (err) {
    console.error(`Error updating order ${id} status:`, err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /api/orders: ลบออเดอร์ที่สถานะ 'done' (ใช้สำหรับเคลียร์ประวัติ)
// ต้องระบุ ?table=X&status=done ใน query parameter และต้องเป็น Admin
app.delete('/api/orders', isAuthenticated, async (req, res) => {
  const { table, status } = req.query;

  if (!table || status !== 'done') {
    return res.status(400).json({ error: 'Invalid parameters. Must specify table and status=done.' });
  }

  try {
    // ลบออกจาก PostgreSQL
    const result = await pool.query('DELETE FROM orders WHERE table_number = $1 AND status = $2 RETURNING *', [table, status]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'No done orders found for this table' });
    }

    // Broadcast การเคลียร์ออเดอร์ (เพื่อให้หน้า History อัปเดต)
    broadcast({
        type: 'ORDERS_CLEARED',
        payload: { table, status }
    });
    
    res.json({ success: true, message: `Cleared ${result.rowCount} orders for table ${table}` });
  } catch (err) {
    console.error('Error clearing orders:', err);
    res.status(500).json({ error: 'Database error' });
  }
});


// ----------------------------------------------------------------------
// --- ส่วนของ Server Start (เดิม) ---
// ----------------------------------------------------------------------
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
