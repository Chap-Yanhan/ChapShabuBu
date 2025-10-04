// history.js
const API_BASE_URL = 'https://shabu-chap-app.onrender.com';

// ฟังก์ชันสำหรับแสดง Custom Alert (มีแค่ปุ่ม 'ตกลง')
function showCustomAlert(title, message, isError = false) {
  const popup = document.querySelector('.custom-alert-popup');
  document.getElementById('alert-title').textContent = title;
  document.getElementById('alert-message').textContent = message;
  document.getElementById('alert-title').style.color = isError ? '#b71c1c' : '#d81b60';
  
  const buttonsDiv = popup.querySelector('.alert-buttons');
  buttonsDiv.innerHTML = `<button id="alert-ok-btn" class="ok-button">ตกลง</button>`;
  
  popup.style.display = 'flex';

  document.getElementById('alert-ok-btn').onclick = () => {
    popup.style.display = 'none';
  };
}

// ฟังก์ชันสำหรับแสดง Custom Confirm (มีปุ่ม 'ตกลง' และ 'ยกเลิก')
function showCustomConfirm(title, message, onConfirm) {
  const popup = document.querySelector('.custom-alert-popup');
  document.getElementById('alert-title').textContent = title;
  document.getElementById('alert-message').textContent = message;
  document.getElementById('alert-title').style.color = '#d81b60';
  
  const buttonsDiv = popup.querySelector('.alert-buttons');
  buttonsDiv.innerHTML = `
    <button id="confirm-ok-btn" class="ok-button">ตกลง</button>
    <button id="confirm-cancel-btn" class="cancel-button">ยกเลิก</button>
  `;

  popup.style.display = 'flex';

  document.getElementById('confirm-ok-btn').onclick = () => {
    popup.style.display = 'none';
    onConfirm();
  };

  document.getElementById('confirm-cancel-btn').onclick = () => {
    popup.style.display = 'none';
  };
}


async function loadOrders() {
  try {
    const res = await fetch(`${API_BASE_URL}/orders?status=done`);
    if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
    }
    const orders = await res.json();
    return orders;
  } catch (error) {
    console.error('Error loading orders:', error);
    showCustomAlert('ข้อผิดพลาด', 'ไม่สามารถโหลดประวัติออเดอร์ได้: ' + error.message, true); // เปลี่ยน showAlertDialog เป็น showCustomAlert
    return [];
  }
}

async function renderOrders() {
  const list = document.getElementById('order-list');
  const orders = await loadOrders();
  if (orders.length === 0) {
    list.innerHTML = '<div style="text-align:center;color:#888;">ยังไม่มีประวัติออเดอร์</div>';
    return;
  }
  list.innerHTML = '';
  
  const byTable = {};
  orders.forEach(order => {
    if (!byTable[order.table]) {
      byTable[order.table] = [];
    }
    byTable[order.table].push(order);
  });

  Object.entries(byTable).forEach(([table, ordersForTable]) => {
    const div = document.createElement('div');
    div.className = 'order-card';
    div.dataset.table = table;

    let orderDetailsHtml = '<div class="order-details-screen">';
    ordersForTable.forEach(order => {
      orderDetailsHtml += `
        <div>เวลา: ${new Date(order.time).toLocaleString('th-TH')}</div>
        <ul>${Object.entries(order.items).map(([name, qty]) => `<li>${name} × ${qty}</li>`).join('')}</ul>
      `;
    });
    orderDetailsHtml += '</div>';

    const summaryItems = {};
    ordersForTable.forEach(order => {
      Object.entries(order.items).forEach(([name, qty]) => {
        summaryItems[name] = (summaryItems[name] || 0) + qty;
      });
    });
    
    let summaryHtml = '<div class="order-summary-print">';
    summaryHtml += `
      <h3>สรุปยอดเมนู: ${table}</h3>
      <ul>
        ${Object.entries(summaryItems).map(([name, qty]) => `<li>${name} <span>${qty}</span></li>`).join('')}
      </ul>
      <p style="text-align:center; margin-top: 20px;">-- ขอบคุณที่ใช้บริการ --</p>
    `;
    summaryHtml += '</div>';

    div.innerHTML = `
      <h3 class="screen-only-title">โต๊ะ: ${table}</h3>
      ${orderDetailsHtml}
      ${summaryHtml}
      <div class="order-card-actions">
        <button class="clear-btn">🗑️ เคลียร์ข้อมูลโต๊ะนี้</button>
        <button class="print-table-button" data-table="${table}">🖨️ พิมพ์โต๊ะนี้</button>
      </div>
    `;
    list.appendChild(div);

    div.querySelector('.clear-btn').onclick = async () => {
      // เรียกใช้ showCustomConfirm สำหรับ Pop-up ยืนยันการลบ
      showCustomConfirm('ยืนยันการเคลียร์ข้อมูล', 'คุณแน่ใจหรือไม่ที่จะเคลียร์ข้อมูลประวัติออเดอร์ของโต๊ะ ' + table + '?', async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/orders?table=${table}&status=done`, { method: 'DELETE' });
          if (!res.ok) {
            const errorData = await res.json();
            showCustomAlert('เคลียร์ข้อมูลไม่สำเร็จ', 'ไม่สามารถเคลียร์ข้อมูลได้: ' + (errorData.error || res.statusText), true);
            return;
          }
          // เรียกใช้ showCustomAlert สำหรับ Pop-up แจ้งผลสำเร็จ
          showCustomAlert('สำเร็จ!', `เคลียร์ข้อมูลโต๊ะ ${table} สำเร็จแล้ว!`);
          renderOrders();
        } catch (error) {
          showCustomAlert('เกิดข้อผิดพลาดในการเชื่อมต่อกับ Server', 'ไม่สามารถเคลียร์ข้อมูลได้: ' + error.message, true);
        }
      });
    };

    div.querySelector('.print-table-button').onclick = (e) => {
      printTableHistory(e.target.dataset.table);
    };
  });
}

function printTableHistory(tableNumber) {
  const allOrderCards = document.querySelectorAll('.order-card');
  allOrderCards.forEach(card => {
    if (card.dataset.table !== tableNumber) {
      card.classList.add('hide-for-print');
    } else {
      card.classList.remove('hide-for-print');
    }
  });
  window.print();
}

window.addEventListener('DOMContentLoaded', renderOrders);

