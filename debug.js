// debug.js - ไฟล์สำหรับทดสอบการเชื่อมต่อ Google Sheet (เวอร์ชันใหม่ v4)
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const creds = require('./credentials.json');

// ❗️❗️ แก้ไขตรงนี้เป็น Sheet ID จริงๆ ของคุณ ❗️❗️
const SHEET_ID = '1kmF_DEUrOsUIlqoADw4WWp5E8ApmMRWtHP1wqK9sEoM'; 

// ตั้งค่าการยืนยันตัวตนแบบใหม่
const serviceAccountAuth = new JWT({
  email: creds.client_email,
  key: creds.private_key,
  scopes: [
    'https://www.googleapis.com/auth/spreadsheets',
  ],
});

const doc = new GoogleSpreadsheet(SHEET_ID, serviceAccountAuth);

async function testConnection() {
  try {
    console.log('1. กำลังโหลดข้อมูลชีต...');
    await doc.loadInfo();
    console.log(`   ✔️ โหลดสำเร็จ! ชื่อชีต: "${doc.title}"`);

    const sheet = doc.sheetsByIndex[0];
    console.log(`2. กำลังเพิ่มข้อมูลทดสอบลงในชีต: "${sheet.title}"`);
    
    await sheet.addRow({
      Timestamp: new Date().toLocaleString('th-TH'),
      Table: 'Test',
      MenuItem: 'Test Item',
      Quantity: 1
    });

    console.log('\n🎉🎉🎉 การเชื่อมต่อและบันทึกข้อมูลสำเร็จ! 🎉🎉🎉');
    console.log('ลองไปเช็คที่ไฟล์ Google Sheet ของคุณได้เลย');

  } catch (error) {
    console.error('\n❌ เกิดข้อผิดพลาด! ❌');
    console.error('----------------------------------------------------');
    console.error(error);
    console.error('----------------------------------------------------');
    console.log('\n👉 กรุณาคัดลอกข้อความ Error ทั้งหมดด้านบนนี้ไปแจ้งผู้ช่วยของคุณ');
  }
}


testConnection();

