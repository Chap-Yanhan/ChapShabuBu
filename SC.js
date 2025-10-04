// SC.js (เวอร์ชันแก้ไข Real-time CRUD)
const API_BASE_URL = 'https://chapshabubu.onrender.com';

let currentOrder = {};
let allMenuItems = [];
let statusIntervalId = null; 

const audioContext = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type = 'click') {
  if (!audioContext) return;
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  if (type === 'click') {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.1);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
  }
  if (type === 'success') {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime);
    oscillator.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.1);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.3);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  }
}

// --- [แก้ไข] ฟังก์ชันเชื่อมต่อ WebSocket และเพิ่ม Real-time CRUD ---
function connectWebSocket() {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${window.location.host}`;
  const ws = new WebSocket(wsUrl);

  ws.onopen = () => { console.log('WebSocket connection established.'); };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    // --- [เพิ่ม] ส่วนจัดการเมื่อมีการเปลี่ยนแปลงเมนู (เพิ่ม/แก้ไข/ลบ) ---
    if (data.type === 'MENU_ITEM_ADDED') {
      const newItem = data.payload;
      allMenuItems.push(newItem);
      renderFilteredMenu();
    } else if (data.type === 'MENU_ITEM_UPDATED') {
      const updatedItem = data.payload;
      const index = allMenuItems.findIndex(item => item.id === updatedItem.id);
      if (index !== -1) {
        allMenuItems[index] = updatedItem;
        renderFilteredMenu();
      }
    } else if (data.type === 'MENU_ITEM_DELETED') {
      const deletedId = data.payload.id;
      allMenuItems = allMenuItems.filter(item => item.id !== deletedId);
      renderFilteredMenu();
    } 
    // --- [จบส่วนเพิ่ม] ---
    
    else if (data.type === 'MENU_STATUS_UPDATE') {
      const { id, is_available } = data.payload;
      
      const itemInArray = allMenuItems.find(item => item.id == id);
      if(itemInArray) itemInArray.is_available = is_available;
      
      const menuItemCard = document.querySelector(`.menu-item[data-item-id='${id}']`);
      if (menuItemCard) {
        const itemName = menuItemCard.dataset.itemName;

        if (is_available) {
          menuItemCard.classList.remove('sold-out');
          menuItemCard.querySelector('.plus').disabled = false;
          menuItemCard.querySelector('.minus').disabled = false;
        } else {
          menuItemCard.classList.add('sold-out');
          menuItemCard.querySelector('.plus').disabled = true;
          menuItemCard.querySelector('.minus').disabled = true;

          if (currentOrder[itemName] && currentOrder[itemName] > 0) {
            currentOrder[itemName] = 0; 
            const input = menuItemCard.querySelector('.quantity-input');
            if (input) input.value = 0;
            
            menuItemCard.style.boxShadow = '';
            menuItemCard.style.transform = '';
            
            updateSubmitButtonState();
            
            showAlertDialog(`ขออภัย, เมนู "${itemName}" เพิ่งหมดสต็อก และได้ถูกนำออกจากออเดอร์ของคุณแล้วครับ`);
          }
        }
      }
    }
  };

  ws.onclose = () => {
    console.log('WebSocket connection closed. Reconnecting in 5 seconds...');
    setTimeout(connectWebSocket, 5000);
  };
}

function getTableFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get('table') || '';
}

function setTableNumber() {
  const table = getTableFromURL();
  if (table) {
    const select = document.getElementById('table-number');
    let tableValue = `โต๊ะ ${table}`;
    if (!isNaN(table) && !table.startsWith('โต๊ะ')) {
        tableValue = `โต๊ะ ${table}`;
    } else {
        tableValue = table;
    }
    for (let option of select.options) {
      if (option.value === tableValue) {
        select.value = option.value;
        break;
      }
    }
    select.disabled = true;
  }
}

function showAlertDialog(message, onConfirm = () => {}) {
  document.querySelectorAll('.custom-alert-popup').forEach(e => e.remove());
  const popup = document.createElement('div');
  popup.className = 'custom-alert-popup';
  popup.innerHTML = `
    <div class="custom-alert-box">
      <h2>แจ้งเตือน</h2>
      <p>${message}</p>
      <button id="alert-ok-btn">ตกลง</button>
    </div>
    <style>
      .custom-alert-popup{position:fixed;z-index:10001;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:15px;box-sizing:border-box;}
      .custom-alert-box{font-family: 'Sarabun', sans-serif;background:#fff;padding:25px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.3);width:100%;max-width:320px;text-align:center;animation:fadeInScale 0.3s ease-out}
      .custom-alert-box h2{color:#d81b60;margin-top:0;margin-bottom:15px}
      .custom-alert-box p{margin-bottom:20px;font-size:1rem;color:#333}
      .custom-alert-box button{background-color:#d81b60;color:white;padding:10px 20px;border:none;border-radius:8px;cursor:pointer;font-size:1em;width:100%;}
      @keyframes fadeInScale{from{opacity:0;transform:scale(0.9)}to{opacity:1;transform:scale(1)}}
    </style>
  `;
  document.body.appendChild(popup);
  document.getElementById('alert-ok-btn').onclick = () => {
    popup.remove();
    onConfirm();
  };
}

function showOrderConfirmPopup(order, table, onConfirm, onBack) {
  document.querySelectorAll('.custom-alert-popup').forEach(e => e.remove());
  const popup = document.createElement('div');
  popup.className = 'custom-alert-popup';
  popup.innerHTML = `
    <div class="order-confirm-box">
      <h2>ยืนยันออเดอร์</h2>
      <p class="table-info">โต๊ะ: <b>${table}</b></p>
      <ul class="order-summary-list">
        ${Object.entries(order).map(([name, qty]) => qty > 0 ? `<li><span class="item-name">${name}</span><span class="item-qty">× ${qty}</span></li>` : '').join('')}
      </ul>
      <div class="confirm-buttons">
        <button id="confirm-order-btn">ยืนยันส่งออเดอร์</button>
        <button id="back-order-btn">ย้อนกลับ</button>
      </div>
    </div>
    <style>
      .custom-alert-popup { position: fixed; z-index: 10001; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; padding: 15px; box-sizing: border-box; }
      .order-confirm-box { font-family: 'Sarabun', sans-serif; background: #fff; padding: 24px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.2); width: 100%; max-width: 350px; text-align: center; animation: fadeInScale 0.3s ease-out; }
      .order-confirm-box h2 { margin-top: 0; margin-bottom: 8px; font-size: 1.5rem; color: #333; }
      .order-confirm-box .table-info { margin-top: 0; margin-bottom: 16px; font-size: 1.1rem; color: #555; }
      .order-summary-list { list-style: none; padding: 0; margin: 0 0 20px 0; max-height: 150px; overflow-y: auto; text-align: left; }
      .order-summary-list li { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
      .order-summary-list li:last-child { border-bottom: none; }
      .item-name { color: #333; }
      .item-qty { font-weight: bold; color: #333; }
      .confirm-buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .order-confirm-box button { width: 100%; padding: 12px; border: none; border-radius: 8px; cursor: pointer; font-size: 1rem; font-family: 'Sarabun', sans-serif; font-weight: 500; transition: background-color 0.2s ease, transform 0.1s ease; }
      #confirm-order-btn { background-color: #d81b60; color: white; }
      #back-order-btn { background-color: #e0e0e0; color: #333; }
      .order-confirm-box button:active { transform: scale(0.97); }
    </style>
  `;
  document.body.appendChild(popup);
  document.getElementById('confirm-order-btn').onclick = () => { popup.remove(); onConfirm(); };
  document.getElementById('back-order-btn').onclick = () => { popup.remove(); if(onBack) onBack(); };
}

async function saveOrderToBackend(order, table) {
  try {
    const res = await fetch(`${API_BASE_URL}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table, items: order })
    });
    if (!res.ok) {
      const errorData = await res.json();
      showAlertDialog('ส่งออเดอร์ไม่สำเร็จ: ' + (errorData.error || 'กรุณาลองใหม่อีกครั้ง'));
      return null;
    }
    return await res.json();
  } catch (error) {
    console.error('Error sending order to backend:', error);
    showAlertDialog('เกิดข้อผิดพลาดในการเชื่อมต่อกับ Server: ' + error.message);
    return null;
  }
}

async function loadMenuForFrontend() {
  const menuGrid = document.getElementById('menu-grid');
  menuGrid.innerHTML = '<div class="loading-placeholder">กำลังโหลดเมนู...</div>';
  try {
    const res = await fetch(`${API_BASE_URL}/api/menu`);
    if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
    }
    allMenuItems = await res.json();
    renderFilteredMenu();
  } catch (error) {
    console.error('Error loading menu for frontend:', error);
    menuGrid.innerHTML = `<div class="loading-placeholder" style="color:red;">ไม่สามารถโหลดเมนูได้: ${error.message}</div>`;
  }
}

// --- [แก้ไข] แยกฟังก์ชัน renderMenu เพื่อใช้กับการกรองและอัปเดตแบบเรียลไทม์ ---
function renderFilteredMenu() {
  const activeCategory = document.querySelector('.tab-button.active')?.dataset.category || 'all';
  let filteredItems = (activeCategory === 'all') ? allMenuItems : allMenuItems.filter(item => item.category === activeCategory);
  renderMenu(filteredItems);
}

function renderMenu(itemsToRender) {
  const menuGrid = document.getElementById('menu-grid');
  menuGrid.innerHTML = '';
  if (itemsToRender.length === 0) {
    menuGrid.innerHTML = '<div class="loading-placeholder">ไม่พบเมนูในหมวดหมู่นี้</div>';
    return;
  }
  itemsToRender.sort((a, b) => a.name.localeCompare(b.name, 'th')); // จัดเรียงตามชื่อ
  itemsToRender.forEach(item => {
    const menuItemDiv = document.createElement('div');
    menuItemDiv.className = 'menu-item';
    menuItemDiv.dataset.itemName = item.name;
    menuItemDiv.dataset.itemId = item.id;

    const imageSrc = item.image ? item.image : `${API_BASE_URL}/img/placeholder.png`;
    const fallbackSrc = `${API_BASE_URL}/img/placeholder.png`;
    const quantity = currentOrder[item.name] || 0;
    menuItemDiv.innerHTML = `
      <img src="${imageSrc}" class="menu-item-image" alt="${item.name}" onerror="this.onerror=null;this.src='${fallbackSrc}';">
      <div class="menu-item-details">
        <p class="menu-item-name">${item.name}</p>
        <div class="quantity-controls">
          <button type="button" class="qty-btn minus" aria-label="ลดจำนวน">-</button>
          <input type="number" class="quantity-input" name="${item.name}" min="0" value="${quantity}" readonly>
          <button type="button" class="qty-btn plus" aria-label="เพิ่มจำนวน">+</button>
        </div>
      </div>
    `;
    
    if (!item.is_available) {
        menuItemDiv.classList.add('sold-out');
    }

    menuGrid.appendChild(menuItemDiv);
    if (quantity > 0) {
        menuItemDiv.style.boxShadow = '0 6px 16px rgba(216, 27, 96, 0.2)';
        menuItemDiv.style.transform = 'scale(1.03)';
    }
  });
  addQuantityButtonListeners();
  updateSubmitButtonState();
}

function updateSubmitButtonState() {
    const submitBtn = document.querySelector('.submit-btn');
    let totalItems = 0;
    for (const qty of Object.values(currentOrder)) {
      totalItems += qty;
    }
    if (totalItems > 0) {
      submitBtn.textContent = `📤 ส่งออเดอร์ (${totalItems} รายการ)`;
    } else {
      submitBtn.textContent = '📤 ส่งออเดอร์';
    }
}

function addQuantityButtonListeners() {
    document.querySelectorAll('.quantity-controls').forEach(control => {
      const minusBtn = control.querySelector('.minus');
      const plusBtn = control.querySelector('.plus');
      const input = control.querySelector('.quantity-input');
      const menuItemCard = control.closest('.menu-item');
      const itemName = menuItemCard.dataset.itemName;
      const updateVisuals = () => {
          const currentValue = parseInt(input.value);
          currentOrder[itemName] = currentValue;
          if (currentValue > 0) {
            menuItemCard.style.boxShadow = '0 6px 16px rgba(216, 27, 96, 0.2)';
            menuItemCard.style.transform = 'scale(1.03)';
          } else {
            menuItemCard.style.boxShadow = '';
            menuItemCard.style.transform = '';
          }
          updateSubmitButtonState();
      };
      minusBtn.addEventListener('click', () => {
          let currentValue = parseInt(input.value);
          if (currentValue > 0) {
            input.value = currentValue - 1;
            playSound('click');
            updateVisuals();
          }
      });
      plusBtn.addEventListener('click', () => {
          let currentValue = parseInt(input.value);
          const isSoldOut = plusBtn.closest('.menu-item').classList.contains('sold-out');
          if (currentValue < 20 && !isSoldOut) {
            input.value = currentValue + 1;
            playSound('click');
            updateVisuals();
          }
      });
    });
}

function resetOrderForm() {
    currentOrder = {};
    renderFilteredMenu();
}

function filterMenuByCategory(category) {
  let filteredItems = (category === 'all') ? allMenuItems : allMenuItems.filter(item => item.category === category);
  renderMenu(filteredItems);
}

function showOrderStatusPopup() {
  if (document.querySelector('.custom-alert-popup')) return;
  const popup = document.createElement('div');
  popup.className = 'custom-alert-popup';
  popup.innerHTML = `
      <div class="order-status-box">
          <h2>ประวัติการสั่งล่าสุด</h2>
          <div class="status-list"><p>กำลังโหลดสถานะ...</p></div>
          <button id="alert-ok-btn">ปิด</button>
      </div>
      <style>
          .custom-alert-popup { position: fixed; z-index: 10001; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; padding: 15px; box-sizing: border-box; }
          .order-status-box { font-family: 'Sarabun', sans-serif; background:#fff; padding:20px; border-radius:12px; width:100%; max-width:380px; text-align:center; animation: fadeInScale 0.3s ease-out; }
          .order-status-box h2 { margin-top:0; color:#d81b60; }
          .status-list { max-height: 300px; overflow-y: auto; margin-bottom: 20px; text-align: left; }
          .status-card { border: 1px solid #eee; border-radius: 8px; padding: 10px; margin-bottom: 10px; }
          .status-header { display: flex; justify-content: space-between; font-size: 0.9em; color: #555; margin-bottom: 8px; }
          .status-items { list-style: none; padding-left: 10px; margin: 0; font-size: 0.95em; }
          #alert-ok-btn { background-color:#d81b60; color:white; padding:10px 20px; border:none; border-radius:8px; cursor:pointer; font-size:1em; width:100%; }
          @keyframes fadeInScale{from{opacity:0;transform:scale(0.9)}to{opacity:1;transform:scale(1)}}
      </style>`;
  document.body.appendChild(popup);
  document.getElementById('alert-ok-btn').onclick = () => {
    clearInterval(statusIntervalId);
    statusIntervalId = null;
    popup.remove();
  };
  updateOrderStatusView(); 
  statusIntervalId = setInterval(updateOrderStatusView, 5000);
}

async function updateOrderStatusView() {
  const statusListDiv = document.querySelector('.status-list');
  if (!statusListDiv) {
      clearInterval(statusIntervalId);
      statusIntervalId = null;
      return;
  }

  const table = document.getElementById('table-number').value;
  if (!table) {
      statusListDiv.innerHTML = '<p>กรุณาเลือกโต๊ะก่อน</p>';
      return;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/orders/by-table?table=${encodeURIComponent(table)}`);
    if (!res.ok) throw new Error('ไม่สามารถโหลดสถานะได้');
    const orders = await res.json();

    if (!orders || orders.length === 0) {
      statusListDiv.innerHTML = '<p>ยังไม่มีประวัติการสั่งในรอบนี้</p>';
      return;
    }

    const orderListHtml = orders
        .sort((a, b) => new Date(b.time) - new Date(a.time))
        .map(order => {
          const statusText = order.status === 'pending' ? 'กำลังเตรียม' : 'เสร็จแล้ว';
          const statusColor = order.status === 'pending' ? '#f39c12' : '#2ecc71';
          const itemsHtml = Object.entries(order.items).map(([name, qty]) => `<li>${name} &times; ${qty}</li>`).join('');
          return `
              <div class="status-card">
                  <div class="status-header">
                      <span>เวลา: ${new Date(order.time).toLocaleTimeString('th-TH')}</span>
                      <span style="color: ${statusColor}; font-weight: bold;">${statusText}</span>
                  </div>
                  <ul class="status-items">${itemsHtml}</ul>
              </div>`;
        }).join('');
    
    statusListDiv.innerHTML = orderListHtml;

  } catch (error) {
    console.error('Fetch status error during update:', error);
    statusListDiv.innerHTML = '<p style="color:red;">เกิดข้อผิดพลาดในการอัปเดต</p>';
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  setTableNumber();
  await loadMenuForFrontend();
  
  document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
      e.target.classList.add('active');
      filterMenuByCategory(e.target.dataset.category);
    });
  });

  document.getElementById('status-btn').addEventListener('click', showOrderStatusPopup);

  document.getElementById('order-form').onsubmit = async function(e) {
    e.preventDefault();
    const table = document.getElementById('table-number').value;
    const orderToSend = {};
    let hasItem = false;
    for (const [item, qty] of Object.entries(currentOrder)) {
        if (qty > 0) {
            orderToSend[item] = qty;
            hasItem = true;
        }
    }
    if (!table) {
      showAlertDialog('กรุณาเลือกหมายเลขโต๊ะ');
      return;
    }
    if (!hasItem) {
      showAlertDialog('กรุณาเลือกรายการอาหารอย่างน้อย 1 รายการ');
      return;
    }
    showOrderConfirmPopup(orderToSend, table, async () => {
      const result = await saveOrderToBackend(orderToSend, table);
      if (result && result.success) {
        playSound('success');
        showAlertDialog('ออเดอร์ถูกส่งเรียบร้อยแล้ว!', () => {
          resetOrderForm();
        });
      }
    });
  };

  connectWebSocket();

});

