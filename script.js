/* =========================================================
   1. CONFIGURATION ET IMPORTATIONS
   ========================================================= */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, updateDoc, doc, query, orderBy, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- TES CLÉS FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyC-4VoHlyQyOq61h0JdHfbh-WI3G8gMjKo",
  authDomain: "rituels-du-monde-46b3d.firebaseapp.com",
  projectId: "rituels-du-monde-46b3d",
  storageBucket: "rituels-du-monde-46b3d.firebasestorage.app",
  messagingSenderId: "707924426339",
  appId: "1:707924426339:web:f6c69cbc867cf86cee4256",
  measurementId: "G-6ZPD1B9VXN"
};

let db;
try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    console.log("Firebase connecté.");
} catch (error) { console.error("Erreur Firebase", error); }

// --- VARIABLES GLOBALES ---
let cart = []; 
let selectedService = { id: null, name: null, price: 0, desc: "" };
let selectedDateObj = null; 
let selectedTimeSlot = null; 
let selectedStaff = "Indifférent";
let selectedOptions = { pression: "Moyenne", music: "Nature" };

/* =========================================================
   2. ROUTER (DÉMARRAGE INTELLIGENT)
   ========================================================= */
document.addEventListener("DOMContentLoaded", () => {
    // On lance le chatbot (corrigé)
    initChatbot();
    loadCart(); 
    
    if (document.getElementById('paypal-button-container')) initPayPal();

    // PAGE ADMIN
    if (document.getElementById('login-form')) initAdminPage(); 
    
    // PAGE BOUTIQUE
    if (document.getElementById('products-container')) initShop();
    
    // PAGE RESERVATION
    if (document.getElementById('modern-calendar')) initCalendar();
});

/* =========================================================
   3. LOGIQUE ADMIN PRO (DASHBOARD & CHART.JS)
   ========================================================= */
function initAdminPage() {
    // A. GESTION CONNEXION
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const u = document.getElementById('admin-user').value;
            const p = document.getElementById('admin-pass').value;

            if(u === "admin" && p === "admin123") {
                document.getElementById('login-screen').style.display = 'none';
                document.getElementById('admin-dashboard').classList.add('visible');
                loadDashboardData(); 
            } else {
                document.getElementById('login-error').style.display = 'block';
            }
        });
    }

    // B. GESTION PRODUITS (AJOUT & MODIF)
    const productForm = document.getElementById('product-form');
    if (productForm) {
        productForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const editId = document.getElementById('edit-id').value; 
            
            const productData = {
                name: document.getElementById('p-name').value,
                price: parseFloat(document.getElementById('p-price').value),
                category: document.getElementById('p-category').value,
                brand: document.getElementById('p-brand').value,
                image: document.getElementById('p-image').value,
                description: document.getElementById('p-desc').value,
                created_at: new Date()
            };

            try {
                if(editId) {
                    await updateDoc(doc(db, "produits", editId), productData);
                    alert("Produit mis à jour !");
                } else {
                    await addDoc(collection(db, "produits"), productData);
                    alert("Nouveau produit ajouté !");
                }
                window.closeProductModal(); // Ferme le modal via la fonction globale
                loadDashboardData(); 
            } catch (error) { console.error(error); alert("Erreur."); }
        });
    }
}

// CHARGEMENT DES DONNÉES (DASHBOARD)
async function loadDashboardData() {
    // 1. PRODUITS
    const productsBody = document.getElementById('products-table-body');
    if (productsBody) {
        const qProd = query(collection(db, "produits"), orderBy("created_at", "desc"));
        const snapProd = await getDocs(qProd);
        
        let prodCount = 0;
        productsBody.innerHTML = "";
        
        snapProd.forEach(docSnap => {
            prodCount++;
            const p = docSnap.data();
            productsBody.innerHTML += `
            <tr>
                <td><img src="${p.image}"></td>
                <td><strong>${p.name}</strong><br><span style="color:#888; font-size:0.8rem;">${p.brand || ''}</span></td>
                <td>${p.price} €</td>
                <td><span class="status-badge" style="background:#eee;">${p.category}</span></td>
                <td class="text-right">
                    <button style="border:none; background:none; cursor:pointer; color:#3498db; margin-right:10px;" 
                        onclick="window.prepareEdit('${docSnap.id}', '${p.name}', '${p.price}', '${p.category}', '${p.brand}', '${p.image}', '${p.description}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button style="border:none; background:none; cursor:pointer; color:#e74c3c;" onclick="window.deleteProduct('${docSnap.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>`;
        });
        document.getElementById('dash-products').innerText = prodCount;
    }

    // 2. COMMANDES & STATS
    const ordersBody = document.getElementById('orders-table-body');
    const recentBody = document.getElementById('dashboard-recent-body');
    const customersBody = document.getElementById('customers-table-body');

    if (ordersBody) {
        const qOrders = query(collection(db, "commandes"), orderBy("date", "desc"));
        const snapOrders = await getDocs(qOrders);

        let orderCount = 0;
        let totalRevenue = 0;
        let customers = {}; 
        let salesData = {}; 

        ordersBody.innerHTML = "";
        recentBody.innerHTML = "";
        customersBody.innerHTML = "";

        snapOrders.forEach(docSnap => {
            const o = docSnap.data();
            const amount = parseFloat(o.total_paye || 0);
            orderCount++;
            totalRevenue += amount;

            if(!customers[o.email]) customers[o.email] = { name: o.client_nom, total: 0, count:0 };
            customers[o.email].total += amount;
            customers[o.email].count++;

            let dateKey = "Inconnue";
            if(o.date && o.date.seconds) {
                dateKey = new Date(o.date.seconds * 1000).toLocaleDateString('fr-FR'); 
            }
            if(!salesData[dateKey]) salesData[dateKey] = 0;
            salesData[dateKey] += amount;

            let dateStr = dateKey;
            let detailsHtml = "";
            if(o.contenu_panier && Array.isArray(o.contenu_panier)) {
                o.contenu_panier.forEach(item => { 
                    detailsHtml += `<div style="font-size:0.8rem;">• ${item.name}</div>`; 
                });
            }

            const rowHtml = `
            <tr>
                <td>${dateStr}</td>
                <td><strong>${o.client_nom}</strong><br><span style="font-size:0.8rem; color:#888;">${o.email}</span></td>
                <td>${detailsHtml}</td>
                <td><strong>${amount.toFixed(2)} €</strong></td>
                <td><span class="status-badge status-paid">${o.status}</span></td>
            </tr>`;
            
            ordersBody.innerHTML += rowHtml;
            if(orderCount <= 5) recentBody.innerHTML += `<tr><td>${o.client_nom}</td><td>${amount.toFixed(2)}€</td><td><span class="status-badge status-paid">Payé</span></td></tr>`;
        });
        
        document.getElementById('dash-revenue').innerText = totalRevenue.toFixed(2) + " €";
        document.getElementById('dash-orders').innerText = orderCount;
        document.getElementById('sidebar-order-count').innerText = orderCount;
        let avg = orderCount > 0 ? (totalRevenue / orderCount).toFixed(2) : "0.00";
        document.getElementById('dash-average').innerText = avg + " €";

        Object.keys(customers).forEach(email => {
            const c = customers[email];
            customersBody.innerHTML += `<tr><td><strong>${c.name}</strong></td><td>${email}</td><td>${c.total.toFixed(2)} €</td><td>${c.count}</td></tr>`;
        });

        renderChart(salesData);
    }
}

function renderChart(salesData) {
    const ctx = document.getElementById('salesChart');
    if(!ctx) return;

    const labels = Object.keys(salesData).reverse().slice(0, 7).reverse();
    const data = labels.map(date => salesData[date]);

    if(window.myChart) window.myChart.destroy();

    window.myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Ventes (€)',
                data: data,
                borderColor: '#C5A059',
                backgroundColor: 'rgba(197, 160, 89, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, grid: { color: '#f0f0f0' } }, x: { grid: { display: false } } }
        }
    });
}

// GLOBALES ADMIN
window.deleteProduct = async function(id) {
    if(confirm("Supprimer ?")) { await deleteDoc(doc(db, "produits", id)); loadDashboardData(); }
};

/* =========================================================
   4. LOGIQUE BOUTIQUE
   ========================================================= */
async function initShop() {
    const container = document.getElementById('products-container');
    if(!container) return;
    try {
        const q = query(collection(db, "produits"));
        const querySnapshot = await getDocs(q);
        container.innerHTML = ""; 
        if(querySnapshot.empty) { container.innerHTML = "<p style='grid-column:1/-1; text-align:center;'>La boutique est vide.</p>"; return; }
        querySnapshot.forEach((docSnap) => {
            const p = docSnap.data();
            container.innerHTML += `
            <div class="shop-item" data-category="${p.category || 'all'}">
                <div class="shop-img-wrap"><img src="${p.image}" alt="${p.name}"></div>
                <div class="shop-info">
                    <span class="shop-brand">${p.brand || 'Rituels'}</span>
                    <h3 class="shop-title">${p.name}</h3>
                    <span class="shop-price">${parseFloat(p.price).toFixed(2)} €</span>
                    <button class="add-btn" onclick="window.addToCart('${docSnap.id}', '${p.name}', '${p.price}', '${p.image}')">Ajouter au panier</button>
                </div>
            </div>`;
        });
    } catch (e) { console.error("Erreur shop :", e); }
}

window.filterShop = function(cat) {
    document.querySelectorAll('.shop-item').forEach(item => {
        item.style.display = (cat === 'all' || item.dataset.category === cat) ? 'block' : 'none';
    });
    document.querySelectorAll('.shop-filter-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
};

/* =========================================================
   5. RESERVATION
   ========================================================= */
function initCalendar() {
     flatpickr("#modern-calendar", {
        inline: true, enableTime: false, dateFormat: "Y-m-d", minDate: "today", locale: "fr",
        disable: [ function(date) { return (date.getDay() === 0); } ],
        onChange: function(selectedDates) {
            if(selectedDates.length > 0) {
                selectedDateObj = selectedDates[0];
                generateTimeSlots(); updateSummary();
            }
        }
    });
}
function generateTimeSlots() {
    const container = document.getElementById('time-slots-container');
    container.innerHTML = ""; selectedTimeSlot = null;
    const btnNext = document.getElementById('btn-to-step3');
    if(btnNext) { btnNext.style.opacity = "0.5"; btnNext.style.pointerEvents = "none"; }
    for (let h = 10; h <= 19; h++) {
        const btn = document.createElement('div');
        btn.className = 'time-slot-btn'; btn.innerText = h + ":00";
        btn.onclick = () => selectTimeSlot(h, btn);
        container.appendChild(btn);
    }
}
window.selectTimeSlot = function(h, b) { selectedTimeSlot = h; document.querySelectorAll('.time-slot-btn').forEach(x => x.classList.remove('selected')); b.classList.add('selected'); const btn = document.getElementById('btn-to-step3'); if(btn) { btn.style.opacity = "1"; btn.style.pointerEvents = "all"; } updateSummary(); };
window.selectStaff = function(c, n) { selectedStaff = n; document.querySelectorAll('.staff-card').forEach(x => x.classList.remove('selected')); c.classList.add('selected'); };
window.selectOption = function(t, v, e) { selectedOptions[t] = v; e.parentElement.querySelectorAll('.option-chip').forEach(x => x.classList.remove('selected')); e.classList.add('selected'); };
window.selectService = function(n, p, i, d) { selectedService = {id:i, name:n, price:p, desc:d}; document.querySelectorAll('.service-card').forEach(x => x.classList.remove('selected')); document.getElementById(i).classList.add('selected'); updateSummary(); setTimeout(() => window.goToStep(2), 400); };
window.goToStep = function(n) { document.querySelectorAll('.step-content').forEach(x => x.classList.remove('active')); document.querySelectorAll('.step-bar').forEach(x => x.classList.remove('active')); document.getElementById('step-'+n).classList.add('active'); for(let i=1; i<=n; i++) document.getElementById('bar-'+i).classList.add('active'); }
function updateSummary() {
    if(selectedService.name) { document.getElementById('sum-soin').innerText = selectedService.name; document.getElementById('sum-price').innerText = selectedService.price.toFixed(2) + " €"; }
    if(selectedDateObj && selectedTimeSlot) { const d = selectedDateObj.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); document.getElementById('sum-date').innerText = `${d} à ${selectedTimeSlot}h00`; }
}
window.finalizeBooking = async function() {
    const btn = document.querySelector('#step-3 .btn');
    const notes = document.getElementById('input-notes').value || "Aucune remarque";
    const fname = document.getElementById('input-firstname').value;
    const lname = document.getElementById('input-lastname').value;
    const email = document.getElementById('input-email').value;
    const phone = document.getElementById('input-phone').value;

    if (!selectedService.name) { alert("Soin manquant."); window.goToStep(1); return; }
    if (!selectedDateObj || !selectedTimeSlot) { alert("Date manquante."); window.goToStep(2); return; }
    if (!fname || !lname || !email || !phone || phone.length < 10) { alert("Coordonnées incomplètes."); return; }

    const datePart = selectedDateObj.toISOString().split('T')[0]; const timePart = selectedTimeSlot;
    btn.innerText = "Vérification..."; btn.disabled = true;

    try {
        const q = query(collection(db, "reservations"), where("date", "==", datePart), where("heure", "==", timePart), where("praticienne", "==", selectedStaff));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty && selectedStaff !== "Indifférent") { alert(`Désolé, créneau pris.`); btn.innerText = "Autre heure"; btn.disabled = false; return; }
        
        await addDoc(collection(db, "reservations"), { 
            soin: selectedService.name, prix: selectedService.price, date: datePart, heure: timePart, 
            praticienne: selectedStaff, options: selectedOptions, 
            client: { prenom: fname, nom: lname, email: email, telephone: phone },
            notes: notes, status: "Au Panier", created_at: new Date() 
        });

        const dateStr = selectedDateObj.toLocaleDateString('fr-FR') + ' à ' + timePart + 'h00';
        const detailsText = `📅 ${dateStr}<br>👤 <strong>${fname} ${lname}</strong><br>📞 ${phone}<br>✨ ${selectedOptions.pression} / ${selectedOptions.music}<br>📝 Note : ${notes}`;
        window.addToCart('resa-'+Date.now(), selectedService.name, selectedService.price, 'https://via.placeholder.com/60', detailsText);
        btn.innerText = "Ajouté !"; btn.disabled = false;
    } catch (e) { console.error(e); alert("Erreur."); btn.disabled = false; }
};

/* =========================================================
   6. GESTION PANIER & PAYPAL
   ========================================================= */
window.addToCart = function(id, name, price, image, details = "") { cart.push({ id, name, price: parseFloat(price), image, details }); saveCart(); updateCartUI(); toggleCart(true); };
window.removeFromCart = function(index) { cart.splice(index, 1); saveCart(); updateCartUI(); };
window.toggleCart = function(forceOpen = false) { const s = document.querySelector('.cart-sidebar'); const o = document.querySelector('.cart-overlay'); if(!s) return; if(forceOpen) { s.classList.add('open'); o.classList.add('open'); } else { s.classList.toggle('open'); o.classList.toggle('open'); } };
function saveCart() { localStorage.setItem('mySpaCart', JSON.stringify(cart)); updateCartCount(); }
function loadCart() { const saved = localStorage.getItem('mySpaCart'); if(saved) cart = JSON.parse(saved); updateCartCount(); updateCartUI(); }
function updateCartCount() { const count = document.getElementById('cart-count'); if(count) count.innerText = cart.length; }
function updateCartUI() {
    const container = document.getElementById('cart-items-container'); const totalEl = document.getElementById('cart-total-price');
    if(!container || !totalEl) return;
    container.innerHTML = ""; let total = 0;
    if(cart.length === 0) { container.innerHTML = "<p style='text-align:center; color:#999; margin-top:20px;'>Votre panier est vide.</p>"; } 
    else {
        cart.forEach((item, index) => {
            total += item.price;
            const descHtml = item.details ? `<div style="font-size:0.75rem; color:#666; margin-top:4px; font-style:italic; background:#f9f9f9; padding:5px; border-radius:4px;">${item.details}</div>` : '';
            container.innerHTML += `<div class="cart-item" style="align-items: flex-start;"><img src="${item.image}" alt="img" style="margin-top:5px;"><div class="cart-item-details"><span class="cart-item-title">${item.name}</span><span class="cart-item-price" style="font-weight:bold; color:#C5A059;">${item.price.toFixed(2)} €</span>${descHtml}</div><span class="cart-remove" onclick="window.removeFromCart(${index})" style="margin-top:5px;">Supprimer</span></div>`;
        });
    }
    totalEl.innerText = total.toFixed(2) + " €";
}
function initPayPal() {
    const container = document.getElementById('paypal-button-container'); if(!container) return;
    paypal.Buttons({
        createOrder: function(data, actions) {
            let total = cart.reduce((sum, item) => sum + item.price, 0); if(total <= 0) return;
            return actions.order.create({ purchase_units: [{ amount: { value: total.toFixed(2) } }] });
        },
        onApprove: function(data, actions) {
            return actions.order.capture().then(async function(details) { 
                try {
                    await addDoc(collection(db, "commandes"), { client_nom: details.payer.name.given_name + " " + details.payer.name.surname, email: details.payer.email_address, total_paye: details.purchase_units[0].amount.value, contenu_panier: cart, status: "Payé", date: new Date() });
                    const modal = document.getElementById('success-modal'); if(modal) modal.classList.add('visible'); else alert('Merci !');
                    cart = []; saveCart(); updateCartUI(); toggleCart(false);
                } catch (e) { console.error(e); alert("Erreur technique."); }
            });
        },
        onError: function (err) { console.error('Erreur PayPal:', err); alert("Paiement échoué."); }
    }).render('#paypal-button-container');
}

/* =========================================================
   7. CHATBOT INTELLIGENT (Connecté à Ollama)
   ========================================================= */
function initChatbot() {
    // --- CORRECTION DU CSS ICI : SUPPRESSION DE 'YXVK' ---
    const style = `
    <style>
        #chatbot-widget { position: fixed; bottom: 20px; right: 20px; z-index: 9999; font-family: 'Inter', sans-serif; }
        /* La couleur est corrigée ci-dessous */
        .chat-btn { width: 60px; height: 60px; background: #C5A059; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 30px; cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.2); transition: 0.3s; }
        .chat-btn:hover { transform: scale(1.1); }
        .chat-window { position: absolute; bottom: 80px; right: 0; width: 350px; height: 450px; background: white; border-radius: 12px; box-shadow: 0 5px 20px rgba(0,0,0,0.15); display: none; flex-direction: column; overflow: hidden; border: 1px solid #eee; }
        .chat-window.open { display: flex; animation: slideUp 0.3s; }
        .chat-header { background: #1e1e2d; color: white; padding: 15px; display: flex; justify-content: space-between; align-items: center; font-weight: 600; }
        .chat-body { flex: 1; padding: 15px; overflow-y: auto; background: #f9f9f9; display: flex; flex-direction: column; gap: 10px; }
        .chat-input { padding: 10px; border-top: 1px solid #eee; display: flex; background: white; }
        .chat-input input { flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 6px; outline: none; }
        .chat-input button { margin-left: 10px; background: #C5A059; color: white; border: none; padding: 0 15px; border-radius: 6px; cursor: pointer; }
        
        .msg { padding: 10px 15px; border-radius: 10px; max-width: 80%; font-size: 0.9rem; line-height: 1.4; }
        .msg.bot { background: white; border: 1px solid #eee; align-self: flex-start; color: #333; border-bottom-left-radius: 2px; }
        .msg.user { background: #C5A059; color: white; align-self: flex-end; border-bottom-right-radius: 2px; }
        
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    </style>`;
    
    document.head.insertAdjacentHTML('beforeend', style);

    const html = `
    <div id="chatbot-widget">
        <div class="chat-window" id="cWindow">
            <div class="chat-header">
                <span>✦ Assistant Spa</span>
                <span style="cursor:pointer" onclick="window.toggleChatBot()">×</span>
            </div>
            <div class="chat-body" id="cBody">
                <div class="msg bot">Bonjour ! Je suis l'IA du Spa. Je connais tous nos tarifs et soins. Comment puis-je vous aider ?</div>
            </div>
            <div class="chat-input">
                <input type="text" id="cInput" placeholder="Posez votre question..." onkeypress="window.handleKey(event)">
                <button onclick="window.sendMsg()">→</button>
            </div>
        </div>
        <div class="chat-btn" onclick="window.toggleChatBot()">💬</div>
    </div>`;
    
    document.body.insertAdjacentHTML('beforeend', html);
}

window.toggleChatBot = function() { 
    const win = document.getElementById('cWindow');
    win.classList.toggle('open'); 
    if(win.classList.contains('open')) document.getElementById('cInput').focus();
};

window.handleKey = function(e) { 
    if(e.key === 'Enter') window.sendMsg(); 
};

// C'EST ICI QUE LA MAGIE OPÈRE (Connexion au Cloud Render)
window.sendMsg = async function() {
    const input = document.getElementById('cInput');
    const body = document.getElementById('cBody');
    const userText = input.value.trim();
    
    if(!userText) return; 

    // 1. Afficher le message de l'utilisateur
    body.innerHTML += `<div class="msg user">${userText}</div>`;
    input.value = ''; 
    body.scrollTop = body.scrollHeight; 

    // 2. Indicateur de chargement
    const loadingId = 'bot-loading-' + Date.now();
    body.innerHTML += `<div class="msg bot" id="${loadingId}">...</div>`;
    body.scrollTop = body.scrollHeight;

    try {
        // 3. REQUÊTE VERS TON SERVEUR EN LIGNE (Render)
        const response = await fetch('https://chatbotrdm.onrender.com/ask', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ message: userText })
        });

        const data = await response.json();

        // 4. Afficher la réponse
        const botMsgDiv = document.getElementById(loadingId);
        if (botMsgDiv) {
            botMsgDiv.innerText = data.text; 
        }

    } catch (error) {
        console.error("Erreur Chatbot:", error);
        const botMsgDiv = document.getElementById(loadingId);
        if (botMsgDiv) {
            botMsgDiv.innerText = "Oups, je n'arrive pas à joindre le serveur.";
            botMsgDiv.style.color = "red";
        }
    }
    body.scrollTop = body.scrollHeight;
};