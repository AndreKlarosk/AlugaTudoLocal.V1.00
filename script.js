// Importações do Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, deleteDoc, updateDoc, serverTimestamp, setLogLevel, setDoc, getDoc, query, where, getDocs, writeBatch, arrayUnion, arrayRemove, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// Configuração do Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAfph9P28ZIRXL3OBbO2waj_GfMH8wHutw",
  authDomain: "projeto-alugatudolocalv1.firebaseapp.com",
  projectId: "projeto-alugatudolocalv1",
  storageBucket: "projeto-alugatudolocalv1.appspot.com",
  messagingSenderId: "890381337365",
  appId: "1:890381337365:web:7e4fadfac06f3142015f1c",
  measurementId: "G-EE89WQ04VB"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const ADMIN_UID = "YgxoSQZVEqVoSkfh3LbxFIhvfHg1";

setLogLevel('debug');
let currentUserId = null;
let currentUserData = null;
let allItems = [];
let lastKnownUnreadCount = 0;

// Referências do DOM
const addItemForm = document.getElementById('addItemForm');
const addItemSection = document.getElementById('addItemSection');
const itemList = document.getElementById('itemList');
const featuredItemsList = document.getElementById('featuredItemsList');
const featuredItemsSection = document.getElementById('featuredItemsSection');
const searchBar = document.getElementById('searchBar');
const categoryFilters = document.getElementById('categoryFilters');
const loadingIndicator = document.getElementById('loadingIndicator');
const authMenu = document.getElementById('authMenu');
const suspensionMessage = document.getElementById('suspensionMessage');
const submitItemBtn = document.getElementById('submitItemBtn');
const itemsCollectionRef = collection(db, "items");

// --- Funções de UI ---
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const bgColor = type === 'success' ? 'bg-green-500' : (type === 'error' ? 'bg-red-500' : 'bg-gray-800');
    toast.className = `toast ${bgColor} text-white py-2 px-4 rounded-lg shadow-lg`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

function setLoadingState(button, isLoading) {
    const btnText = button.querySelector('.btn-text');
    const spinner = button.querySelector('.spinner');
    if (isLoading) {
        button.disabled = true;
        if (btnText) btnText.classList.add('hidden');
        if (spinner) spinner.classList.remove('hidden');
    } else {
        button.disabled = false;
        if (btnText) btnText.classList.remove('hidden');
        if (spinner) spinner.classList.add('hidden');
    }
}

// --- Funções de Autenticação e UI ---
async function saveUserToFirestore(user) {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
        const userData = {
            uid: user.uid,
            displayName: user.displayName,
            email: user.email,
            photoURL: user.photoURL,
            createdAt: serverTimestamp(),
            favorites: [],
            isSuspended: false,
            userRole: 'locatario', // Papel padrão
            subscriptionExpiresAt: null
        };
        await setDoc(userRef, userData);
    } else {
        await updateDoc(userRef, { lastLogin: serverTimestamp() });
    }
}

async function checkUserStatus(user) {
    if (!user) {
        updateUIForAuthState(null, null);
        return;
    }
    await saveUserToFirestore(user);
    const userRef = doc(db, "users", user.uid);
    onSnapshot(userRef, (userSnap) => {
        currentUserData = userSnap.exists() ? userSnap.data() : null;
        updateUIForAuthState(user, currentUserData);
    });
    listenToNotifications(user.uid);
}

function updateUIForAuthState(user, userData) {
    if (user && userData) {
        currentUserId = user.uid;
        const isAdmin = user.uid === ADMIN_UID;
        
        // VERIFICAÇÃO CHAVE: O utilizador é um locador E a assinatura não expirou
        const subscriptionActive = userData.userRole === 'locador' && userData.subscriptionExpiresAt?.toDate() > new Date();
        const isLocador = subscriptionActive;
        
        const adminLinkHTML = isAdmin ? `<a href="admin.html" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Painel Admin</a>` : '';
        const addItemLinkHTML = isLocador ? `<a href="#" id="add-item-link" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Anunciar Novo Item</a>` : '';

        authMenu.innerHTML = `
            <div class="relative">
                <button id="menu-toggle" class="flex items-center gap-2 p-2 bg-white/20 rounded-full shadow-lg">
                    <img src="${user.photoURL}" alt="Foto" class="w-8 h-8 rounded-full">
                    <span class="text-white font-semibold hidden md:block">${user.displayName.split(' ')[0]}</span>
                    <div id="notification-badge" class="hidden absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white"></div>
                </button>
                <div id="dropdown-menu" class="dropdown-menu hidden absolute left-0 mt-2 w-56 bg-white rounded-md shadow-xl py-1 transform origin-top-left scale-95 opacity-0">
                    <a href="perfil.html" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Meu Perfil</a>
                    ${addItemLinkHTML}
                    <a href="#" id="favorites-link" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Meus Favoritos</a>
                    <div id="notifications-container">
                         <a href="#" id="notifications-link" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 relative">
                            Notificações
                            <span id="notification-count" class="absolute right-4 top-1/2 -translate-y-1/2 bg-red-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5"></span>
                        </a>
                        <div id="notifications-list" class="hidden max-h-48 overflow-y-auto border-t border-gray-200"></div>
                    </div>
                    ${adminLinkHTML}
                    <a href="#" id="logoutBtn" class="block px-4 py-2 text-sm text-red-600 hover:bg-red-50 border-t">Sair</a>
                </div>
            </div>
        `;
        
        if (isLocador) {
            document.getElementById('add-item-link').addEventListener('click', (e) => {
                e.preventDefault();
                addItemSection.classList.toggle('hidden');
                if (!addItemSection.classList.contains('hidden')) {
                    addItemSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                document.getElementById('dropdown-menu').classList.add('hidden', 'opacity-0', 'scale-95');
            });
        }
        
        if (userData.isSuspended) {
            suspensionMessage.classList.remove('hidden');
            suspensionMessage.textContent = 'A sua conta está suspensa. Não pode anunciar novos itens. Por favor, contacte o suporte.';
            submitItemBtn.disabled = true;
            submitItemBtn.classList.add('opacity-50', 'cursor-not-allowed');
        } else if (userData.userRole === 'locador' && !isLocador) { // Era locador, mas a assinatura expirou
            suspensionMessage.classList.remove('hidden');
            suspensionMessage.textContent = 'A sua assinatura expirou. Por favor, renove o seu plano no seu perfil para anunciar novos itens.';
            if (addItemSection) addItemSection.classList.add('hidden');
            submitItemBtn.disabled = true;
            submitItemBtn.classList.add('opacity-50', 'cursor-not-allowed');
        } else {
            suspensionMessage.classList.add('hidden');
            submitItemBtn.disabled = false;
            submitItemBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        }

        document.getElementById('logoutBtn').addEventListener('click', (e) => { e.preventDefault(); signOut(auth); });
        document.getElementById('favorites-link').addEventListener('click', (e) => { e.preventDefault(); filterByFavorites(); });
        document.getElementById('notifications-link').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            document.getElementById('notifications-list').classList.toggle('hidden');
            markNotificationsAsRead();
        });
    } else {
        currentUserId = null;
        currentUserData = null;
        authMenu.innerHTML = `<button id="loginBtn" class="bg-white text-indigo-600 px-4 py-2 rounded-lg font-bold hover:bg-gray-200">Entrar com Google</button>`;
        addItemSection.classList.add('hidden');
        document.getElementById('loginBtn').addEventListener('click', () => signInWithPopup(auth, provider));
    }
    renderFilteredItems(searchBar.value);
}

// --- Funções de Renderização ---

function renderFilteredItems(filterText = '', filterCategory = '', showOnlyFavorites = false) {
    let itemsToRender = allItems;
    if (showOnlyFavorites) {
        if (currentUserData && currentUserData.favorites) {
            itemsToRender = allItems.filter(item => currentUserData.favorites.includes(item.id));
        } else {
            itemsToRender = [];
        }
    }
    const featuredItems = [];
    const regularItems = [];
    itemsToRender.forEach(item => {
        if (item.data.isFeatured) featuredItems.push(item);
        else regularItems.push(item);
    });
    renderItems(featuredItems, featuredItemsList, filterText, filterCategory);
    renderItems(regularItems, itemList, filterText, filterCategory);
    featuredItemsSection.style.display = featuredItems.length > 0 && !showOnlyFavorites ? 'block' : 'none';
}

function renderItems(items, container, filterText, filterCategory) {
    container.innerHTML = '';
    const filtered = items.filter(item => {
        const nameMatch = item.data.itemName.toLowerCase().includes(filterText.toLowerCase());
        const categoryMatch = !filterCategory || item.data.category.toLowerCase() === filterCategory.toLowerCase();
        return nameMatch && categoryMatch;
    });
    if (filtered.length > 0) {
        filtered.forEach(item => renderItemCard(item.id, item.data, container));
    } else if (container === itemList) {
        const message = document.getElementById('favorites-link')?.classList.contains('bg-indigo-100') ? 'A sua lista de favoritos está vazia.' : 'Nenhum item encontrado.';
        container.innerHTML = `<p class="col-span-full text-center text-white/80">${message}</p>`;
    }
}

function renderItemCard(id, data, container) {
    const card = document.createElement('div');
    card.className = "item-card-animation bg-white/90 rounded-xl shadow-lg overflow-hidden flex flex-col transition-all duration-300 hover:shadow-2xl hover:scale-105 transform";
    card.setAttribute('data-id', id);
    const isFavorited = currentUserData?.favorites?.includes(id);
    const rating = data.averageRating ? `⭐ ${data.averageRating.toFixed(1)} (${data.reviewCount || 0})` : 'Sem avaliações';
    card.innerHTML = `
        <div class="relative">
            <img src="${data.imageUrl}" alt="${data.itemName}" class="w-full h-56 object-cover cursor-pointer" onerror="this.onerror=null;this.src='https://placehold.co/600x400/ef4444/ffffff?text=Imagem+Inválida';">
            <button class="favorite-btn absolute top-2 right-2 bg-black/40 p-2 rounded-full text-white hover:text-red-500 transition" data-item-id="${id}">
                <svg class="w-6 h-6" fill="${isFavorited ? '#ef4444' : 'none'}" stroke="${isFavorited ? '#ef4444' : 'currentColor'}" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.5l1.318-1.182a4.5 4.5 0 116.364 6.364L12 21l-7.682-7.318a4.5 4.5 0 010-6.364z"></path></svg>
            </button>
            <div class="absolute bottom-0 right-0 bg-black/60 text-white p-2 rounded-tl-lg text-lg font-bold">
                R$${Number(data.pricePerDay).toFixed(2)}<span class="font-normal text-sm">/dia</span>
            </div>
        </div>
        <div class="p-5 flex flex-col flex-grow cursor-pointer">
            <div class="flex justify-between items-center mb-2">
                <p class="text-xs text-indigo-700 font-semibold bg-indigo-100 px-3 py-1 rounded-full self-start">${data.category}</p>
                <p class="text-sm font-semibold text-gray-700">${rating}</p>
            </div>
            <h3 class="text-xl font-bold text-gray-900 mb-2 truncate">${data.itemName}</h3>
            <p class="text-gray-600 text-sm flex-grow mb-4 line-clamp-2">${data.description}</p>
        </div>
    `;
    card.querySelector('img').addEventListener('click', () => showItemDetailModal(id));
    card.querySelector('.p-5').addEventListener('click', () => showItemDetailModal(id));
    card.querySelector('.favorite-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavorite(id);
    });
    container.appendChild(card);
}

// --- Funções de Modal ---

function showModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => {
        modal.firstElementChild.classList.remove('scale-95', 'opacity-0');
        modal.classList.remove('opacity-0');
    }, 10);
}

function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.firstElementChild.classList.add('scale-95', 'opacity-0');
    modal.classList.add('opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }, 300);
}

async function showItemDetailModal(id) {
    const item = allItems.find(i => i.id === id);
    if (!item) return;
    const { data, id: docId } = item;
    const modalContent = document.querySelector('#itemDetailModal .modal-content');
    const rating = data.averageRating ? `⭐ ${data.averageRating.toFixed(1)} (${data.reviewCount || 0} avaliações)` : 'Sem avaliações';
    modalContent.innerHTML = `
        <img src="${data.imageUrl}" alt="${data.itemName}" class="w-full h-64 object-cover rounded-t-2xl" onerror="this.onerror=null;this.src='https://placehold.co/600x400/ef4444/ffffff?text=Imagem+Inválida';">
        <div class="p-6">
            <div class="flex justify-between items-start">
                <div>
                    <p class="text-sm text-indigo-700 font-semibold bg-indigo-100 px-3 py-1 rounded-full inline-block mb-2">${data.category}</p>
                    <h3 class="text-3xl font-bold text-gray-900">${data.itemName}</h3>
                    <p class="text-lg font-semibold text-gray-700 mt-1">${rating}</p>
                </div>
                <p class="text-3xl font-bold text-indigo-600">R$${Number(data.pricePerDay).toFixed(2)}<span class="text-lg font-normal text-gray-500">/dia</span></p>
            </div>
            <p class="text-gray-600 mt-4">${data.description}</p>
            <div id="modal-actions" class="mt-6 flex gap-4 border-t pt-4"></div>
            <div class="mt-6 border-t pt-4">
                <h4 class="text-xl font-bold mb-4">Avaliações</h4>
                <div id="review-form-container"></div>
                <div id="reviews-list" class="space-y-4 mt-4">A carregar avaliações...</div>
            </div>
            <button onclick="document.getElementById('itemDetailModal').dispatchEvent(new Event('close'))" class="absolute top-4 right-4 text-gray-500 hover:text-gray-800 text-3xl">&times;</button>
        </div>
    `;
    const actionsContainer = modalContent.querySelector('#modal-actions');
    if (currentUserId === data.ownerId) {
        actionsContainer.innerHTML = `<button id="editItemBtn" class="bg-yellow-500 text-white font-bold py-2 px-4 rounded-lg">Editar</button><button id="deleteItemBtn" class="bg-red-500 text-white font-bold py-2 px-4 rounded-lg">Excluir</button>`;
        actionsContainer.querySelector('#editItemBtn').addEventListener('click', () => showEditItemModal(docId));
        actionsContainer.querySelector('#deleteItemBtn').addEventListener('click', () => deleteItem(docId));
    } else {
        actionsContainer.innerHTML = `<button id="contactOwnerBtn" class="flex-1 bg-green-500 text-white font-bold py-3 px-4 rounded-lg">Contatar Proprietário</button>`;
      actionsContainer.querySelector('#contactOwnerBtn').addEventListener('click', () => {
            showOwnerProfileModal(data.ownerId);
            hideModal('itemDetailModal'); // Opcional: esconde o modal de item para focar no perfil
        });

            // 2. Criar uma referência e buscar o documento do proprietário
            const ownerRef = doc(db, "users", ownerId);
            const ownerSnap = await getDoc(ownerRef);

            if (ownerSnap.exists()) {
                const ownerData = ownerSnap.data();

                // 3. Extrair os dados de contato do perfil do proprietário
                const ownerEmail = ownerData.email || 'Não informado';
                const ownerPhone = ownerData.phone || 'Não informado'; // Assumindo que o campo 'phone' existe

                // 4. Exibir os dados para o utilizador
                alert(
                    `Entre em contato com o proprietário:\n\n` +
                    `Email: ${ownerEmail}\n` +
                    `Telefone/WhatsApp: ${ownerPhone}`
                );
            } else {
                alert('Erro: Não foi possível encontrar os dados de contato do proprietário.');
                console.error("Documento do proprietário não encontrado:", ownerId);
            }
        } catch (error) {
            alert('Ocorreu um erro ao buscar os contatos. Tente novamente mais tarde.');
            console.error("Erro ao contatar proprietário:", error);
        }
    });
    // =================================================================


    }
    showModal('itemDetailModal');
    loadReviews(docId);
}
async function showOwnerProfileModal(ownerId) {
    const modalContent = document.getElementById('ownerProfileModalContent');
    modalContent.innerHTML = `<div class="p-8"><p>A carregar perfil...</p></div>`; // Estado de carregamento
    showModal('ownerProfileModal'); // Mostra o modal imediatamente

    try {
        const ownerRef = doc(db, "users", ownerId);
        const ownerSnap = await getDoc(ownerRef);

        if (!ownerSnap.exists()) {
            showToast("Erro: Proprietário não encontrado.", "error");
            hideModal('ownerProfileModal');
            return;
        }

        const ownerData = ownerSnap.data();
        const memberSince = ownerData.createdAt ?
            `Membro desde ${ownerData.createdAt.toDate().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}` :
            '';

        // Prepara o número de telefone para o link do WhatsApp (remove caracteres não numéricos e adiciona 55)
        const phone = ownerData.phone ? String(ownerData.phone).replace(/\D/g, '') : '';
        const whatsappLink = phone ? `https://wa.me/55${phone}` : '';

        modalContent.innerHTML = `
            <div class="bg-gray-200 h-24 rounded-t-2xl"></div>
            <div class="p-6 pt-0">
                <img src="${ownerData.photoURL}" alt="Foto de ${ownerData.displayName}" class="owner-photo" onerror="this.onerror=null;this.src='https://placehold.co/400x400/6366f1/ffffff?text=${ownerData.displayName[0]}';">
                
                <h3 class="text-2xl font-bold text-gray-900">${ownerData.displayName}</h3>
                <p class="text-sm text-gray-500 mb-6">${memberSince}</p>

                <div class="space-y-4 text-left">
                    ${whatsappLink ? `
                    <a href="${whatsappLink}" target="_blank" class="contact-button contact-button-whatsapp">
                        <svg fill="currentColor" viewBox="0 0 24 24"><path d="M16.75 13.96c.25.13.42.2.42.51v.21c-.02.75-.48 1.4-1.12 1.52-1.23.23-2.5-.22-3.6-1.03-.98-.71-1.72-1.7-2.2-2.78-.5-1.1-.35-2.35.34-3.55.2-.34.42-.64.67-.9.23-.25.5-.37.7-.37h.19c.35-.02.65.17.8.48l.4 1.15c.13.34.12.74-.04 1.09-.16.35-.45.68-.78.93-.2.15-.38.33-.3.61.1.28.43.92.93 1.42.5.5.95.73 1.42.93.28.1.46-.1.61-.3.25-.33.58-.62.93-.78.35-.16.74-.17 1.09-.04l1.15.4c.3.15.48.45.48.8zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>
                        <span>Conversar no WhatsApp</span>
                    </a>
                    ` : ''}

                    <a href="mailto:${ownerData.email}" class="contact-button contact-button-email">
                        <svg fill="currentColor" viewBox="0 0 24 24"><path d="M22 6C22 4.9 21.1 4 20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6ZM20 6L12 11L4 6H20ZM20 18H4V8L12 13L20 8V18Z"/></svg>
                        <span>Enviar Email</span>
                    </a>
                </div>
            </div>
             <button onclick="hideModal('ownerProfileModal')" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-3xl">&times;</button>
        `;
    } catch (error) {
        console.error("Erro ao buscar perfil do proprietário:", error);
        modalContent.innerHTML = `<div class="p-8"><p class="text-red-500">Ocorreu um erro ao carregar o perfil.</p></div>`;
    }
}

function showEditItemModal(id) {
    const item = allItems.find(i => i.id === id);
    if (!item) return;
    const { data, id: docId } = item;
    const modalContent = document.querySelector('#editItemModal .modal-content');
    modalContent.innerHTML = `
        <h2 class="text-2xl font-bold mb-6">Editar Item</h2>
        <form id="editForm" data-id="${docId}">
            <div class="space-y-4">
                <input type="text" name="itemName" value="${data.itemName}" class="w-full p-2 border rounded-lg" placeholder="Nome do Item">
                <textarea name="description" class="w-full p-2 border rounded-lg" rows="3">${data.description}</textarea>
                <input type="number" name="pricePerDay" value="${data.pricePerDay}" class="w-full p-2 border rounded-lg" placeholder="Preço por dia">
                <input type="text" name="category" value="${data.category}" class="w-full p-2 border rounded-lg" placeholder="Categoria">
                <input type="url" name="imageUrl" value="${data.imageUrl}" class="w-full p-2 border rounded-lg" placeholder="URL da Imagem">
            </div>
            <div class="mt-6 flex gap-4">
                <button type="button" onclick="document.getElementById('editItemModal').dispatchEvent(new Event('close'))" class="flex-1 bg-gray-200 py-2 px-4 rounded-lg">Cancelar</button>
                <button type="submit" class="flex-1 bg-indigo-600 text-white py-2 px-4 rounded-lg flex items-center justify-center">
                    <span class="btn-text">Salvar Alterações</span>
                    <span class="spinner hidden"></span>
                </button>
            </div>
        </form>
    `;
    hideModal('itemDetailModal');
    showModal('editItemModal');
    document.getElementById('editForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const form = e.target;
        const button = form.querySelector('button[type="submit"]');
        setLoadingState(button, true);
        const updatedData = {
            itemName: form.itemName.value, description: form.description.value,
            pricePerDay: parseFloat(form.pricePerDay.value), category: form.category.value,
            imageUrl: form.imageUrl.value,
        };
        updateItem(form.dataset.id, updatedData).finally(() => setLoadingState(button, false));
    });
}

// --- Lógica de Avaliações, Favoritos e Notificações ---

async function createNotification(userId, message, itemId = null) {
    if (!userId) return;
    const notificationData = {
        type: 'general',
        message,
        isRead: false,
        createdAt: serverTimestamp()
    };
    if (itemId) {
        notificationData.itemId = itemId;
    }
    await addDoc(collection(db, `users/${userId}/notifications`), notificationData);
}

async function toggleFavorite(itemId) {
    if (!currentUserId) { 
        showToast("Precisa de estar logado para favoritar itens.", "error");
        return; 
    }
    const userRef = doc(db, "users", currentUserId);
    const btn = document.querySelector(`.favorite-btn[data-item-id="${itemId}"] svg`);
    
    if (currentUserData?.favorites?.includes(itemId)) {
        if (btn) {
            btn.setAttribute('fill', 'none');
            btn.setAttribute('stroke', 'currentColor');
        }
        await updateDoc(userRef, { favorites: arrayRemove(itemId) });
        showToast("Removido dos favoritos!", "info");
    } else {
        if (btn) {
            btn.setAttribute('fill', '#ef4444');
            btn.setAttribute('stroke', '#ef4444');
        }
        await updateDoc(userRef, { favorites: arrayUnion(itemId) });
        showToast("Adicionado aos favoritos!", "success");
    }
}

function filterByFavorites() {
    document.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active', 'bg-indigo-600', 'text-white'));
    const favLink = document.getElementById('favorites-link');
    if (favLink) favLink.classList.add('bg-indigo-100', 'font-bold');
    document.getElementById('searchBar').value = '';
    renderFilteredItems('', '', true);
    const dropdown = document.getElementById('dropdown-menu');
    if (dropdown) dropdown.classList.add('hidden', 'opacity-0', 'scale-95');
}

async function handleReviewSubmit(e, itemId, ownerId) {
    e.preventDefault();
    const form = e.target;
    const button = form.querySelector('button[type="submit"]');
    const rating = form.rating.value;
    const comment = form.comment.value;
    if (!rating) { alert("Por favor, selecione uma classificação por estrelas."); return; }
    
    setLoadingState(button, true);

    const review = {
        itemId, ownerId,
        reviewerId: currentUserId,
        reviewerName: currentUserData.displayName,
        reviewerPhotoURL: currentUserData.photoURL,
        rating: Number(rating),
        comment,
        createdAt: serverTimestamp()
    };

    const batch = writeBatch(db);
    const newReviewRef = doc(collection(db, "reviews"));
    batch.set(newReviewRef, review);
    
    const itemRef = doc(db, "items", itemId);
    const reviewsQuery = query(collection(db, "reviews"), where("itemId", "==", itemId));
    const reviewsSnapshot = await getDocs(reviewsQuery);
    const totalRating = reviewsSnapshot.docs.reduce((sum, doc) => sum + doc.data().rating, Number(rating));
    const newReviewCount = reviewsSnapshot.size + 1;
    const newAverageRating = totalRating / newReviewCount;
    batch.update(itemRef, { averageRating: newAverageRating, reviewCount: newReviewCount });

    if (ownerId !== currentUserId) {
        await createNotification(ownerId, `${currentUserData.displayName} avaliou o seu item.`, itemId);
    }
    await batch.commit();
    form.reset();
    showToast("Avaliação enviada com sucesso!", "success");
    setLoadingState(button, false);
}

function loadReviews(itemId) {
    const reviewsList = document.getElementById('reviews-list');
    const reviewFormContainer = document.getElementById('review-form-container');
    const q = query(collection(db, "reviews"), where("itemId", "==", itemId));
    onSnapshot(q, (snapshot) => {
        reviewsList.innerHTML = '';
        if (snapshot.empty) {
            reviewsList.innerHTML = '<p class="text-gray-500">Este item ainda não tem avaliações. Seja o primeiro!</p>';
        } else {
            snapshot.docs.forEach(doc => {
                const review = doc.data();
                const reviewEl = document.createElement('div');
                reviewEl.className = 'border-t pt-4';
                reviewEl.innerHTML = `
                    <div class="flex items-center gap-3">
                        <img src="${review.reviewerPhotoURL}" class="w-8 h-8 rounded-full">
                        <div>
                            <p class="font-semibold">${review.reviewerName}</p>
                            <p class="text-sm text-gray-500">${'⭐'.repeat(review.rating)}</p>
                        </div>
                    </div>
                    <p class="mt-2 text-gray-700">${review.comment}</p>
                `;
                reviewsList.appendChild(reviewEl);
            });
        }
        const item = allItems.find(i => i.id === itemId);
        if (currentUserId && currentUserId !== item.data.ownerId) {
            reviewFormContainer.innerHTML = `
                <form id="add-review-form" class="space-y-4 pt-4 border-t">
                    <h5 class="font-bold">Deixe a sua avaliação</h5>
                    <div class="star-rating">
                        <input type="radio" id="5-stars" name="rating" value="5" /><label for="5-stars">⭐</label>
                        <input type="radio" id="4-stars" name="rating" value="4" /><label for="4-stars">⭐</label>
                        <input type="radio" id="3-stars" name="rating" value="3" /><label for="3-stars">⭐</label>
                        <input type="radio" id="2-stars" name="rating" value="2" /><label for="2-stars">⭐</label>
                        <input type="radio" id="1-star" name="rating" value="1" /><label for="1-star">⭐</label>
                    </div>
                    <textarea name="comment" class="w-full p-2 border rounded-lg" placeholder="Escreva o seu comentário..."></textarea>
                    <button type="submit" class="bg-indigo-600 text-white px-4 py-2 rounded-lg flex items-center justify-center">
                        <span class="btn-text">Enviar Avaliação</span>
                        <span class="spinner hidden"></span>
                    </button>
                </form>
            `;
            document.getElementById('add-review-form').addEventListener('submit', (e) => handleReviewSubmit(e, itemId, item.data.ownerId));
          const starContainer = document.querySelector('.star-rating');
if (starContainer) {
    const allLabels = Array.from(starContainer.querySelectorAll('label'));

    starContainer.addEventListener('click', (e) => {
        // Garante que o clique foi numa estrela (label)
        if (e.target.tagName === 'LABEL') {
            const clickedLabel = e.target;
            const clickedIndex = allLabels.findIndex(label => label === clickedLabel);

            // Pinta ou despinta as estrelas com base na posição da que foi clicada
            allLabels.forEach((label, index) => {
                if (index >= clickedIndex) {
                    label.style.color = '#f59e0b'; // Amarelo
                } else {
                    label.style.color = '#d1d5db'; // Cinza
                }
            });
        }
    });
}
// =================================================================
        } else {
            reviewFormContainer.innerHTML = '';
        }
    });
}

function listenToNotifications(uid) {
    const q = query(collection(db, `users/${uid}/notifications`), orderBy("createdAt", "desc"));
    onSnapshot(q, (snapshot) => {
        const unreadCount = snapshot.docs.filter(doc => !doc.data().isRead).length;
        if (unreadCount > lastKnownUnreadCount && typeof Tone !== 'undefined' && Tone.context.state === 'running') {
            const synth = new Tone.Synth().toDestination();
            synth.triggerAttackRelease("E5", "16n");
        }
        lastKnownUnreadCount = unreadCount;

        const badge = document.getElementById('notification-badge');
        const countSpan = document.getElementById('notification-count');
        const list = document.getElementById('notifications-list');
        if (list) {
            list.innerHTML = '';
            if (snapshot.empty) {
                list.innerHTML = '<p class="px-4 py-2 text-sm text-gray-500">Nenhuma notificação.</p>';
            } else {
                snapshot.docs.forEach(doc => {
                    const notif = doc.data();
                    const notifEl = document.createElement('a');
                    notifEl.href = '#';
                    notifEl.className = `block px-4 py-2 text-sm text-gray-600 ${!notif.isRead ? 'font-bold' : ''}`;
                    notifEl.textContent = notif.message;
                    if (notif.itemId) {
                        notifEl.onclick = (e) => { e.preventDefault(); showItemDetailModal(notif.itemId); };
                    }
                    list.appendChild(notifEl);
                });
            }
        }
        if (badge && countSpan) {
            badge.classList.toggle('hidden', unreadCount === 0);
            countSpan.textContent = unreadCount > 0 ? unreadCount : '';
            countSpan.classList.toggle('hidden', unreadCount === 0);
        }
    });
}

async function markNotificationsAsRead() {
    if (!currentUserId) return;
    const q = query(collection(db, `users/${currentUserId}/notifications`), where("isRead", "==", false));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return;
    const batch = writeBatch(db);
    snapshot.forEach(doc => batch.update(doc.ref, { isRead: true }));
    await batch.commit();
}

// --- Lógica do Firestore ---

function listenToItems() {
    onSnapshot(itemsCollectionRef, (snapshot) => {
        if(loadingIndicator) loadingIndicator.style.display = 'none';
        allItems = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
        renderFilteredItems(searchBar.value);
        renderCategoryFilters();
    });
}

async function addItem(newItemData) {
    try {
        const docRef = await addDoc(itemsCollectionRef, newItemData);
        addItemForm.reset();
        addItemSection.classList.add('hidden');
        await createNotification(currentUserId, `O seu item "${newItemData.itemName}" foi anunciado!`, docRef.id);
        showToast("Item anunciado com sucesso!", "success");
    } catch (error) { 
        console.error("Erro ao adicionar: ", error); 
        showToast("Falha ao anunciar o item.", "error");
    }
}

async function deleteItem(id) {
    if (window.confirm("Tem a certeza que deseja excluir este item?")) {
        try {
            await deleteDoc(doc(db, "items", id));
            hideModal('itemDetailModal');
            showToast("Item excluído com sucesso!", "success");
        } catch (error) {
            console.error("Erro ao deletar: ", error);
            showToast("Falha ao excluir o item.", "error");
        }
    }
}

async function updateItem(id, data) {
    try {
        const docRef = doc(db, "items", id);
        await updateDoc(docRef, data);
        hideModal('editItemModal');
        await createNotification(currentUserId, `O seu item "${data.itemName}" foi atualizado.`, id);
        showToast("Item atualizado com sucesso!", "success");
    } catch (error) {
        console.error("Erro ao atualizar: ", error);
        showToast("Falha ao atualizar o item.", "error");
    }
}

// --- Event Listeners ---

document.body.addEventListener('click', async () => {
    if (typeof Tone !== 'undefined' && Tone.context.state !== 'running') {
        await Tone.start();
        console.log('Audio context started');
    }
}, { once: true });

document.body.addEventListener('click', (e) => {
    const toggle = document.getElementById('menu-toggle');
    const menu = document.getElementById('dropdown-menu');
    if (toggle && toggle.contains(e.target)) {
        menu.classList.toggle('hidden');
        menu.classList.toggle('opacity-0');
        menu.classList.toggle('scale-95');
    } else if (menu && !menu.contains(e.target) && !e.target.closest('#notifications-container')) {
        menu.classList.add('hidden', 'opacity-0', 'scale-95');
    }
});

addItemForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const button = e.target.querySelector('button[type="submit"]');
    
    // Verificação final no momento do envio
    const subscriptionActive = currentUserData?.userRole === 'locador' && currentUserData?.subscriptionExpiresAt?.toDate() > new Date();

    if (!currentUserId || !subscriptionActive) { 
        showToast("Deve ter uma assinatura de locador ativa para anunciar um item.", "error");
        return; 
    }

    setLoadingState(button, true);
    const newItem = {
        itemName: addItemForm.itemName.value, description: addItemForm.itemDescription.value,
        pricePerDay: parseFloat(addItemForm.itemPrice.value), category: addItemForm.itemCategory.value,
        imageUrl: addItemForm.imageUrl.value, ownerId: currentUserId, 
        createdAt: serverTimestamp(),
        isFeatured: false,
        averageRating: 0,
        reviewCount: 0
    };
    addItem(newItem).finally(() => setLoadingState(button, false));
});

searchBar.addEventListener('input', (e) => {
    document.getElementById('favorites-link')?.classList.remove('bg-indigo-100', 'font-bold');
    const activeCategoryBtn = document.querySelector('.category-btn.active');
    const activeCategory = activeCategoryBtn ? activeCategoryBtn.textContent : '';
    renderFilteredItems(e.target.value, activeCategory === 'Todos' ? '' : activeCategory);
});

categoryFilters.addEventListener('click', (e) => {
    if (e.target.classList.contains('category-btn')) {
        document.querySelectorAll('.category-btn').forEach(btn => {
            btn.classList.remove('active', 'bg-indigo-600', 'text-white');
            btn.classList.add('bg-white/80', 'text-gray-700');
        });
        e.target.classList.add('active', 'bg-indigo-600', 'text-white');
        e.target.classList.remove('bg-white/80', 'text-gray-700');
        const category = e.target.textContent === 'Todos' ? '' : e.target.textContent;
        document.getElementById('favorites-link')?.classList.remove('bg-indigo-100', 'font-bold');
        renderFilteredItems(searchBar.value, category);
    }
});

['itemDetailModal', 'editItemModal'].forEach(id => {
    const modal = document.getElementById(id);
    modal.addEventListener('click', (e) => { if (e.target === modal) hideModal(id); });
    modal.addEventListener('close', () => hideModal(id));
});

// --- Execução Inicial ---
onAuthStateChanged(auth, checkUserStatus);
listenToItems();

// Esta função não está definida no seu ficheiro original, mas é necessária para os filtros.
// Adicionando uma implementação básica.
function renderCategoryFilters() {
    const categories = ['Todos', ...new Set(allItems.map(item => item.data.category))];
    const filtersContainer = document.getElementById('categoryFilters');
    filtersContainer.innerHTML = categories.map((cat, index) => {
        const isActive = index === 0;
        return `<button class="category-btn px-3 py-1 rounded-full text-sm font-semibold transition ${isActive ? 'active bg-indigo-600 text-white' : 'bg-white/80 text-gray-700'}">${cat}</button>`;
    }).join('');
}
