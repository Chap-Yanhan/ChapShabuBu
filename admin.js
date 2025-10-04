// admin.js (เวอร์ชันอัปเกรด - DOM Manipulation)
const API_BASE_URL = 'https://chapshabubu.onrender.com';

// --- ฟังก์ชัน Helpers (ไม่มีการแก้ไข) ---
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

async function checkAuth() {
  const res = await fetch(`${API_BASE_URL}/admin/check-auth`);
  const data = await res.json();
  if (!data.isAuthenticated) {
    window.location.href = 'admin_login.html';
  }
}

// --- [ปรับปรุง] ฟังก์ชันสำหรับสร้าง HTML ของการ์ดเมนู 1 ใบ ---
function createMenuCardHTML(item) {
    return `
      <img src="${item.image || 'img/placeholder.png'}" alt="${item.name}" style="${!item.is_available ? 'filter: grayscale(100%);' : ''}">
      <h4>${item.name}</h4>
      <p>หมวดหมู่: ${item.category}</p>
      <div class="menu-card-actions">
        <button class="edit-btn" data-id="${item.id}">✏️ แก้ไข</button>
        <button class="delete-btn" data-id="${item.id}">🗑️ ลบ</button>
      </div>
      <div style="padding: 0 10px;">
          <button 
              class="toggle-btn ${item.is_available ? 'available' : 'unavailable'}" 
              data-id="${item.id}">
              ${item.is_available ? '✅ มีของ' : '❌ ของหมด'}
          </button>
      </div>
    `;
}

// --- [ปรับปรุง] ฟังก์ชันสำหรับผูก Event Listeners ให้กับการ์ด 1 ใบ ---
function addEventListenersToCard(cardElement) {
    cardElement.querySelector('.edit-btn').onclick = (e) => editMenuItem(e.target.dataset.id);
    cardElement.querySelector('.delete-btn').onclick = (e) => deleteMenuItem(e.target.dataset.id);
    cardElement.querySelector('.toggle-btn').onclick = (e) => toggleAvailability(e.target.dataset.id, e.target);
}


// --- [แก้ไข] ฟังก์ชัน loadMenu ให้ใช้ฟังก์ชันย่อย ---
async function loadMenu() {
  const menuListDiv = document.getElementById('menu-list');
  menuListDiv.innerHTML = 'กำลังโหลดเมนู...';
  try {
    const res = await fetch(`${API_BASE_URL}/api/menu`);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const menuItems = await res.json();
    
    menuListDiv.innerHTML = ''; // เคลียร์หน้าจอ
    
    if (menuItems.length === 0) {
      menuListDiv.innerHTML = '<div style="text-align:center; color:#888;">ยังไม่มีเมนูในระบบ</div>';
      return;
    }

    menuItems.forEach(item => {
      const menuCard = document.createElement('div');
      menuCard.className = 'menu-card';
      menuCard.dataset.id = item.id; // เพิ่ม data-id ที่นี่เพื่อให้ค้นหาง่าย
      menuCard.innerHTML = createMenuCardHTML(item);
      menuListDiv.appendChild(menuCard);
      addEventListenersToCard(menuCard);
    });

  } catch (error) {
    console.error('Error loading menu:', error);
    menuListDiv.innerHTML = `<div style="color:red;">เกิดข้อผิดพลาดในการโหลดเมนู: ${error.message}</div>`;
  }
}

// --- [แก้ไข] ฟังก์ชัน addOrUpdateMenu ไม่ให้เรียก loadMenu() ---
async function addOrUpdateMenu(e) {
  e.preventDefault();
  const form = e.target;
  const id = form.querySelector('#menu-id').value;
  const name = form.querySelector('#menu-name').value;
  const category = form.querySelector('#menu-category').value;
  const imageFile = form.querySelector('#menu-image').files[0];

  const formData = new FormData();
  formData.append('name', name);
  formData.append('category', category);
  if (imageFile) formData.append('image', imageFile);

  const isUpdating = !!id;
  const url = isUpdating ? `${API_BASE_URL}/api/menu/${id}` : `${API_BASE_URL}/api/menu`;
  const method = isUpdating ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, { method, body: formData });
    if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Server error');
    }
    
    const updatedItem = await res.json();

    if (isUpdating) {
        // อัปเดตการ์ดที่มีอยู่
        const cardToUpdate = document.querySelector(`.menu-card[data-id="${id}"]`);
        if(cardToUpdate) {
            cardToUpdate.innerHTML = createMenuCardHTML(updatedItem.item);
            addEventListenersToCard(cardToUpdate);
        }
    } else {
        // เพิ่มการ์ดใหม่
        const menuListDiv = document.getElementById('menu-list');
        const newMenuCard = document.createElement('div');
        newMenuCard.className = 'menu-card';
        newMenuCard.dataset.id = updatedItem.item.id;
        newMenuCard.innerHTML = createMenuCardHTML(updatedItem.item);
        menuListDiv.appendChild(newMenuCard);
        addEventListenersToCard(newMenuCard);
    }

    showCustomAlert('สำเร็จ!', `บันทึกเมนู "${name}" สำเร็จแล้ว`);
    form.reset();
    form.querySelector('#menu-id').value = '';
    form.querySelector('#submit-menu-btn').textContent = 'เพิ่มเมนู';
    form.querySelector('#image-preview').style.display = 'none';

  } catch (error) {
    showCustomAlert('เกิดข้อผิดพลาด', `ไม่สามารถบันทึกเมนูได้: ${error.message}`, true);
  }
}

// --- [แก้ไข] ฟังก์ชัน editMenuItem ให้ดึงข้อมูลจาก DOM โดยตรง ---
function editMenuItem(id) {
    const card = document.querySelector(`.menu-card[data-id="${id}"]`);
    if (!card) {
        showCustomAlert('ข้อผิดพลาด', 'ไม่พบการ์ดเมนูที่ต้องการแก้ไข', true);
        return;
    }
    const name = card.querySelector('h4').textContent;
    const categoryText = card.querySelector('p').textContent.replace('หมวดหมู่: ', '');
    const imageSrc = card.querySelector('img').src;

    // หาค่า category value จาก text
    const categorySelect = document.getElementById('menu-category');
    let categoryValue = '';
    for (const option of categorySelect.options) {
        if (option.textContent === categoryText) {
            categoryValue = option.value;
            break;
        }
    }
    
    document.getElementById('menu-id').value = id;
    document.getElementById('menu-name').value = name;
    document.getElementById('menu-category').value = categoryValue;
    document.getElementById('submit-menu-btn').textContent = 'บันทึกการแก้ไข';
    
    const imagePreview = document.getElementById('image-preview');
    imagePreview.src = imageSrc;
    imagePreview.style.display = 'block';
    
    window.scrollTo(0, 0);
}

// --- [แก้ไข] ฟังก์ชัน deleteMenuItem ไม่ให้เรียก loadMenu() ---
function deleteMenuItem(id) {
  showCustomConfirm('ยืนยันการลบ', 'คุณแน่ใจหรือไม่ที่จะลบเมนูนี้?', async () => {
    try {
        const res = await fetch(`${API_BASE_URL}/api/menu/${id}`, { method: 'DELETE' });
        if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.error || 'Server error');
        }
        
        // ลบการ์ดออกจากหน้าจอ
        const cardToRemove = document.querySelector(`.menu-card[data-id="${id}"]`);
        if (cardToRemove) cardToRemove.remove();
        
        showCustomAlert('สำเร็จ!', 'ลบเมนูสำเร็จแล้ว');
    } catch (error) {
        showCustomAlert('เกิดข้อผิดพลาด', `ไม่สามารถลบเมนูได้: ${error.message}`, true);
    }
  });
}

// --- [สร้างใหม่] ฟังก์ชันสำหรับ Toggle โดยเฉพาะ ---
async function toggleAvailability(id, buttonElement) {
    try {
        const res = await fetch(`${API_BASE_URL}/api/menu/${id}/toggle-availability`, { method: 'PUT' });
        if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.error || 'Server error');
        }

        const data = await res.json();
        const { is_available } = data.item;

        const menuCard = buttonElement.closest('.menu-card');
        const img = menuCard.querySelector('img');

        if (is_available) {
            buttonElement.textContent = '✅ มีของ';
            buttonElement.className = 'toggle-btn available';
            img.style.filter = '';
        } else {
            buttonElement.textContent = '❌ ของหมด';
            buttonElement.className = 'toggle-btn unavailable';
            img.style.filter = 'grayscale(100%)';
        }
    } catch (error) {
        showCustomAlert('เกิดข้อผิดพลาด', `ไม่สามารถเปลี่ยนสถานะได้: ${error.message}`, true);
    }
}


async function handleLogout() {
  const res = await fetch(`${API_BASE_URL}/admin/logout`);
  if (res.ok) {
    window.location.href = 'admin_login.html';
  } else {
    showCustomAlert('ออกจากระบบไม่สำเร็จ', 'ไม่สามารถออกจากระบบได้', true);
  }
}

document.getElementById('menu-image').addEventListener('change', function(event) {
    const reader = new FileReader();
    const imagePreview = document.getElementById('image-preview');
    if (event.target.files.length > 0) {
        reader.onload = function(e) {
            imagePreview.src = e.target.result;
            imagePreview.style.display = 'block';
        };
        reader.readAsDataURL(event.target.files[0]);
    } else {
        imagePreview.style.display = 'none';
        imagePreview.src = '#';
    }
});

document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  loadMenu();
  document.getElementById('menu-form').addEventListener('submit', addOrUpdateMenu);
  document.getElementById('logout-btn').addEventListener('click', handleLogout);
});

