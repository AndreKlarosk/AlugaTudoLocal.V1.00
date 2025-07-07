// Importações do Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, collection, onSnapshot, doc, deleteDoc, updateDoc, query, where, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

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

// Referências do DOM
const authContainerProfile = document.getElementById('authContainerProfile');
const profileContent = document.getElementById('profileContent');
const accessDeniedMessage = document.getElementById('accessDeniedMessage');
const userPhoto = document.getElementById('userPhoto');
const userName = document.getElementById('userName');
const userEmail = document.getElementById('userEmail');
const myItemsList = document.getElementById('myItemsList');
const myItemsSection = document.getElementById('myItemsSection');
const noItemsMessage = document.getElementById('noItemsMessage');
const locadorInfo = document.getElementById('locadorInfo');
const subscriptionPlansSection = document.getElementById('subscriptionPlansSection');
const paymentInstructions = document.getElementById('paymentInstructions');

let currentUserId = null;
let currentUserData = null;

// --- Funções de UI ---
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const bgColor = type === 'success' ? 'bg-green-500' : (type === 'error' ? 'bg-red-500' : 'bg-gray-800');
    toast.className = `${bgColor} text-white py-2 px-4 rounded-lg shadow-lg animate-bounce`;
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

// --- Lógica de Autenticação e UI ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUserId = user.uid;
        accessDeniedMessage.classList.add('hidden');
        profileContent.classList.remove('hidden');

        const userRef = doc(db, "users", user.uid);
        onSnapshot(userRef, (docSnap) => {
            if (docSnap.exists()) {
                currentUserData = docSnap.data();
                updateProfileUI(user, currentUserData);
                const subscriptionActive = currentUserData.userRole === 'locador' && currentUserData.subscriptionExpiresAt?.toDate() > new Date();
                if (subscriptionActive) {
                    myItemsSection.classList.remove('hidden');
                    loadMyItems(user.uid);
                } else {
                    myItemsSection.classList.add('hidden');
                }
            }
        });

        authContainerProfile.innerHTML = `
            <div class="flex items-center gap-4">
                <a href="index.html" class="text-white hover:text-indigo-300">Página Inicial</a>
                <button id="logoutBtnProfile" class="bg-red-500 text-white px-3 py-1 rounded-md text-sm hover:bg-red-600 transition">Sair</button>
            </div>
        `;
        document.getElementById('logoutBtnProfile').addEventListener('click', () => signOut(auth));
    } else {
        currentUserId = null;
        currentUserData = null;
        accessDeniedMessage.classList.remove('hidden');
        profileContent.classList.add('hidden');
    }
});

function updateProfileUI(user, userData) {
    userPhoto.src = user.photoURL;
    userName.textContent = user.displayName;
    userEmail.textContent = user.email;

    const subscriptionActive = userData.userRole === 'locador' && userData.subscriptionExpiresAt?.toDate() > new Date();

    if (subscriptionActive) {
        subscriptionPlansSection.classList.add('hidden');
        paymentInstructions.classList.add('hidden');
        locadorInfo.classList.remove('hidden');

        document.getElementById('locadorFullName').textContent = userData.fullName || 'Não informado';
        document.getElementById('locadorDocument').textContent = userData.documentId || 'Não informado';
        document.getElementById('locadorPhone').textContent = userData.phone || 'Não informado';
        document.getElementById('locadorPixKey').textContent = userData.pixKey || 'Não informado';
        
        const expirationDate = userData.subscriptionExpiresAt.toDate();
        document.getElementById('subscriptionEndDate').textContent = expirationDate.toLocaleDateString('pt-BR', {
            day: '2-digit', month: 'long', year: 'numeric'
        });

    } else {
        locadorInfo.classList.add('hidden');
        subscriptionPlansSection.classList.remove('hidden');
        if (userData.userRole === 'locador') {
            showToast("A sua assinatura expirou! Renove para continuar a anunciar.", "error");
        }
    }
}


// --- Carregar Itens do Utilizador ---
function loadMyItems(uid) {
    const q = query(collection(db, "items"), where("ownerId", "==", uid));
    onSnapshot(q, (snapshot) => {
        myItemsList.innerHTML = '';
        if (snapshot.empty) {
            noItemsMessage.classList.remove('hidden');
        } else {
            noItemsMessage.classList.add('hidden');
            snapshot.forEach(doc => {
                renderMyItemCard(doc.id, doc.data());
            });
        }
    });
}

function renderMyItemCard(id, data) {
    const card = document.createElement('div');
    card.className = "bg-white rounded-xl shadow-lg overflow-hidden flex flex-col";
    const rating = data.averageRating ? `⭐ ${data.averageRating.toFixed(1)} (${data.reviewCount || 0})` : 'Sem avaliações';
    card.innerHTML = `
        <img src="${data.imageUrl}" alt="${data.itemName}" class="w-full h-48 object-cover" onerror="this.onerror=null;this.src='https://placehold.co/600x400/ef4444/ffffff?text=Imagem+Inválida';">
        <div class="p-5 flex flex-col flex-grow">
            <div class="flex justify-between items-center mb-2">
                <p class="text-xs text-indigo-700 font-semibold bg-indigo-100 px-3 py-1 rounded-full self-start">${data.category}</p>
                <p class="text-sm font-semibold text-gray-700">${rating}</p>
            </div>
            <h3 class="text-xl font-bold text-gray-900 mb-2 truncate">${data.itemName}</h3>
            <div class="mt-auto pt-4 flex gap-2">
                <button data-id="${id}" class="edit-btn w-full bg-yellow-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-yellow-600 transition">Editar</button>
                <button data-id="${id}" class="delete-btn w-full bg-red-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-600 transition">Excluir</button>
            </div>
        </div>
    `;
    myItemsList.appendChild(card);
}

// --- Funções de Modal e Ações ---
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

function showEditItemModal(id, data) {
    const modalContent = document.querySelector('#editItemModal .modal-content');
    modalContent.innerHTML = `
        <h2 class="text-2xl font-bold mb-6">Editar Item</h2>
        <form id="editForm" data-id="${id}">
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

async function updateItem(id, data) {
    try {
        const docRef = doc(db, "items", id);
        await updateDoc(docRef, data);
        hideModal('editItemModal');
        showToast('Item atualizado com sucesso!', 'success');
    } catch (error) {
        console.error("Erro ao atualizar: ", error);
        showToast('Falha ao atualizar o item.', 'error');
    }
}

async function deleteItem(id) {
    if (window.confirm("Tem a certeza que deseja excluir este item?")) {
        try {
            await deleteDoc(doc(db, "items", id));
            showToast('Item excluído com sucesso!', 'success');
        } catch (error) {
            console.error("Erro ao deletar: ", error);
            showToast('Falha ao excluir o item.', 'error');
        }
    }
}

// --- Event Listeners ---
myItemsList.addEventListener('click', async (e) => {
    const target = e.target;
    const itemId = target.dataset.id;
    if (!itemId) return;

    if (target.classList.contains('edit-btn')) {
        const itemDoc = await getDoc(doc(db, "items", itemId));
        if (itemDoc.exists()) {
            showEditItemModal(itemId, itemDoc.data());
        }
    } else if (target.classList.contains('delete-btn')) {
        deleteItem(itemId);
    }
});

subscriptionPlansSection.addEventListener('click', (e) => {
    if (e.target.classList.contains('select-plan-btn')) {
        const plan = e.target.dataset.plan;
        const plansInfo = {
            mensal: { name: 'Mensal (Locador Casual)', price: 'R$ 19,90' },
            semestral: { name: 'Semestral (Locador Frequente)', price: 'R$ 99,90' },
            anual: { name: 'Anual (Locador Profissional)', price: 'R$ 179,90' }
        };

        document.getElementById('selectedPlanText').textContent = plansInfo[plan].name;
        document.getElementById('planPriceText').textContent = plansInfo[plan].price;
        
        paymentInstructions.classList.remove('hidden');
        paymentInstructions.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
});

document.getElementById('editItemModal').addEventListener('close', () => hideModal('editItemModal'));
document.getElementById('editItemModal').addEventListener('click', (e) => { if (e.target === e.currentTarget) hideModal('editItemModal'); });