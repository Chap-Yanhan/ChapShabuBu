// kitchen.js
// สำหรับหน้าออเดอร์สด (ฝั่งครัว) - เพิ่มเสียงพูดแจ้งเตือน (เวอร์ชันแก้ไข)

const API_BASE_URL = 'https://shabu-chap-app.onrender.com';

// --- [ปรับปรุง] ส่วนจัดการเสียงพูด ---
let displayedOrderIds = new Set();
let englishVoice = null; // [แก้ไข] เปลี่ยนตัวแปรสำหรับเก็บเสียงภาษาอังกฤษ
let isInitialLoad = true; // [ใหม่] เพิ่มตัวแปรเพื่อจัดการการโหลดครั้งแรก

// [ปรับปรุง] ฟังก์ชันสำหรับโหลดเสียงที่พร้อมใช้งานในเบราว์เซอร์
function loadVoices() {
  // พยายามโหลดเสียงทันที
  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
      // [แก้ไข] ค้นหาเสียง en-US หรือ en-GB
      englishVoice = voices.find(voice => voice.lang === 'en-US' || voice.lang === 'en-GB');
      if (englishVoice) console.log('English voice loaded immediately.');
  }
  
  // ตั้งค่าให้โหลดซ้ำเมื่อมีการเปลี่ยนแปลง (สำหรับบางเบราว์เซอร์ที่โหลดช้า)
  window.speechSynthesis.onvoiceschanged = () => {
    const updatedVoices = window.speechSynthesis.getVoices();
    englishVoice = updatedVoices.find(voice => voice.lang === 'en-US' || voice.lang === 'en-GB');
    if (englishVoice) console.log('English voice loaded via event.');
  };
}

// [ปรับปรุง] ฟังก์ชันสำหรับสร้างเสียงพูด
function speakNotification(message = 'New Order') { // [แก้ไข] เปลี่ยนข้อความเริ่มต้นเป็นภาษาอังกฤษ
  // [แก้ไข] ตรวจสอบหาเสียงอังกฤษทุกครั้งก่อนพูด
  const currentEnglishVoice = window.speechSynthesis.getVoices().find(voice => voice.lang === 'en-US' || voice.lang === 'en-GB') || englishVoice;

  if ('speechSynthesis' in window && currentEnglishVoice) {
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(message);
    utterance.voice = currentEnglishVoice; // กำหนดเสียงเป็นภาษาอังกฤษ
    utterance.lang = 'en-US'; // [แก้ไข] ตั้งค่าภาษาเป็นอังกฤษ
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    window.speechSynthesis.speak(utterance);
  } else {
    console.log('Speech Synthesis or English voice not available. Falling back to alarm sound.');
    playAlarmSound(); // ใช้เสียงสำรองถ้าเสียงพูดไม่พร้อม
  }
}

// ฟังก์ชันเสียงอลาร์ม (เก็บไว้เป็นตัวสำรอง)
const audioContext = new (window.AudioContext || window.webkitAudioContext)();
function playAlarmSound() {
  if (!audioContext) return;
  if (audioContext.state === 'suspended') { audioContext.resume(); }
  const duration = 0.15, pause = 0.1, volume = 0.3;
  const t = audioContext.currentTime;
  const osc1 = audioContext.createOscillator(), gain1 = audioContext.createGain();
  osc1.connect(gain1); gain1.connect(audioContext.destination);
  osc1.type = 'square'; osc1.frequency.setValueAtTime(1200, t);
  gain1.gain.setValueAtTime(volume, t);
  gain1.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc1.start(t); osc1.stop(t + duration);
  const osc2 = audioContext.createOscillator(), gain2 = audioContext.createGain();
  osc2.connect(gain2); gain2.connect(audioContext.destination);
  osc2.type = 'square'; osc2.frequency.setValueAtTime(800, t + duration + pause);
  gain2.gain.setValueAtTime(volume, t + duration + pause);
  gain2.gain.exponentialRampToValueAtTime(0.0001, t + (duration * 2) + pause);
  osc2.start(t + duration + pause); osc2.stop(t + (duration * 2) + pause);
}

// [ปรับปรุง] Event Listener สำหรับเปิดใช้งานเสียง
function enableAudioAndSpeech() {
  // เปิดใช้งาน AudioContext สำหรับเสียงสำรอง
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume();
  }
  
  // "อุ่นเครื่อง" ระบบเสียงพูดเพื่อให้พร้อมใช้งาน
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel(); // เคลียร์คิวที่อาจค้างอยู่
  }
  
  console.log('Audio/Speech enabled by user interaction.');
  const audioNotice = document.getElementById('audio-notice');
  if (audioNotice) {
    audioNotice.style.display = 'none';
  }
  document.body.removeEventListener('click', enableAudioAndSpeech);
}
document.body.addEventListener('click', enableAudioAndSpeech);


async function loadOrders() {
  try {
    const res = await fetch(`${API_BASE_URL}/orders?status=pending`);
    if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  } catch (error) {
    console.error('Error loading orders:', error);
    document.getElementById('order-list').innerHTML = `<div style="text-align:center;color:red;">เกิดข้อผิดพลาดในการโหลดออเดอร์: ${error.message}</div>`;
    return [];
  }
}

async function renderOrders() {
  const list = document.getElementById('order-list');
  const orders = await loadOrders();
  const newOrderIds = new Set(orders.map(o => o.id));

  const hasNewOrder = [...newOrderIds].some(id => !displayedOrderIds.has(id));

  // --- [แก้ไข] ตรรกะการเล่นเสียง ---
  // จะเล่นเสียงเมื่อมีออเดอร์ใหม่ และไม่ใช่การโหลดหน้าครั้งแรก
  if (hasNewOrder && !isInitialLoad) {
    speakNotification("New Order");
  }
  
  // อัปเดต ID ที่แสดงผล และเปลี่ยนสถานะการโหลดครั้งแรก
  displayedOrderIds = newOrderIds;
  isInitialLoad = false;
  // ------------------------------------

  if (orders.length === 0) {
    list.innerHTML = '<div style="text-align:center;color:#888;">ยังไม่มีออเดอร์ใหม่</div>';
    return;
  }
  list.innerHTML = '';
  orders.forEach(order => {
    const div = document.createElement('div');
    div.className = 'order-card';
    div.innerHTML = `
      <h3>โต๊ะ: ${order.table}</h3>
      <div>เวลา: ${new Date(order.time).toLocaleString('th-TH')}</div>
      <ul>
        ${Object.entries(order.items).map(([name, qty]) => `<li>${name} × ${qty}</li>`).join('')}
      </ul>
      <button class="done-btn">✅ กดเมื่อเตรียมเสร็จแล้ว</button>
    `;
    div.querySelector('.done-btn').onclick = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/orders/${order.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'done' })
        });
        if (!res.ok) {
          throw new Error(`Server responded with status: ${res.status}`);
        }
        renderOrders(); 
      } catch (error) {
        console.error('Error updating order status:', error);
        alert('เกิดข้อผิดพลาด ไม่สามารถอัปเดตสถานะออเดอร์ได้');
      }
    };
    list.appendChild(div);
  });
}

window.addEventListener('DOMContentLoaded', () => {
    loadVoices(); // [ใหม่] เริ่มโหลดเสียงทันทีที่หน้าเว็บพร้อม

    const notice = document.createElement('div');
    notice.id = 'audio-notice';
    notice.textContent = '🔊 คลิกที่ใดก็ได้บนหน้าจอเพื่อเปิดเสียงแจ้งเตือน';
    notice.style.cssText = 'position: fixed; bottom: 10px; left: 50%; transform: translateX(-50%); background-color: rgba(0,0,0,0.7); color: white; padding: 10px 20px; border-radius: 20px; z-index: 10001; font-family: Sarabun, sans-serif;';
    document.body.appendChild(notice);

    renderOrders();
});


setInterval(renderOrders, 5000);



