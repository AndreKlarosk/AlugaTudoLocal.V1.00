// Importações do Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, collection, onSnapshot, doc, deleteDoc, query, where, getDocs, updateDoc, limit, startAfter, endBefore, orderBy, getCountFromServer, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
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

// Referências do DOM e Variáveis de Paginação
const authContainerAdmin = document.getElementById('authContainerAdmin');
const accessMessage = document.getElementById('accessMessage');
const adminContent = document.getElementById('adminContent');
const usersTableBody = document.getElementById('usersTableBody');
const itemsTableBody = document.getElementById('itemsTableBody');
const reviewsTableBody = document.getElementById('reviewsTableBody');
const totalUsersStat = document.getElementById('totalUsersStat');
const totalItemsStat = document.getElementById('totalItemsStat');
const chartCanvas = document.getElementById('itemsByCategoryChart');
const usersPagination = document.getElementById('usersPagination');
const itemsPagination = document.getElementById('itemsPagination');
const subscriptionModal = document.getElementById('subscriptionModal');
const modalUserName = document.getElementById('modalUserName');
const confirmSubscriptionBtn = document.getElementById('confirmSubscriptionBtn');
const cancelSubscriptionBtn = document.getElementById('cancelSubscriptionBtn');
const subscriptionPlanSelect = document.getElementById('subscriptionPlan');

let categoryChart = null;

const PAGE_SIZE = 10;
let lastVisibleUser = null;
let firstVisibleUser = null;
let lastVisibleItem = null;
let firstVisibleItem = null;

// --- Lógica de Autenticação ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        authContainerAdmin.innerHTML = `
            <div class="flex items-center gap-4">
                <span class="text-sm">${user.displayName}</span>
                <button id="logoutBtnAdmin" class="bg-red-500 text-white px-3 py-1 rounded-md text-sm hover:bg-red-600 transition">Sair</button>
            </div>
        `;
        document.getElementById('logoutBtnAdmin').addEventListener('click', () => signOut(auth));

        if (user.uid === ADMIN_UID) {
            accessMessage.classList.add('hidden');
            adminContent.classList.remove('hidden');
            loadAdminData();
        } else {
            accessMessage.classList.remove('hidden');
            adminContent.classList.add('hidden');
            accessMessage.innerHTML = `<h2 class="text-2xl font-bold text-red-600">Acesso Negado</h2><p class="mt-2 text-gray-600">Esta conta não tem permissões de administrador.</p>`;
        }
    } else {
        authContainerAdmin.innerHTML = `<button id="loginBtnAdmin" class="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 transition">Entrar com Google</button>`;
        document.getElementById('loginBtnAdmin').addEventListener('click', () => signInWithPopup(auth, provider));
        
        accessMessage.classList.remove('hidden');
        adminContent.classList.add('hidden');
        accessMessage.innerHTML = `<h2 class="text-2xl font-bold text-yellow-600">Login Necessário</h2><p class="mt-2 text-gray-600">Por favor, faça login com uma conta de administrador.</p>`;
    }
});

// --- Funções de Carregamento de Dados com Paginação ---
function loadAdminData() {
    loadUsers();
    loadItems();
    loadReviews();
    updateDashboardStats();
}

async function updateDashboardStats() {
    const usersCount = (await getCountFromServer(collection(db, "users"))).data().count;
    const itemsCount = (await getCountFromServer(collection(db, "items"))).data().count;
    totalUsersStat.textContent = usersCount;
    totalItemsStat.textContent = itemsCount;
    
    const itemsSnapshot = await getDocs(collection(db, "items"));
    const categoryCounts = {};
    itemsSnapshot.forEach(doc => {
        const item = doc.data();
        categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
    });
    updateCategoryChart(categoryCounts);
}

function loadUsers(direction = 'first') {
    let q;
    if (direction === 'next' && lastVisibleUser) {
        q = query(collection(db, "users"), orderBy("displayName"), startAfter(lastVisibleUser), limit(PAGE_SIZE));
    } else if (direction === 'prev' && firstVisibleUser) {
        q = query(collection(db, "users"), orderBy("displayName", "desc"), startAfter(firstVisibleUser), limit(PAGE_SIZE));
    } else {
        q = query(collection(db, "users"), orderBy("displayName"), limit(PAGE_SIZE));
    }
    
    onSnapshot(q, (snapshot) => {
        if (snapshot.empty && direction !== 'first') {
            alert("Não há mais utilizadores para mostrar.");
            return;
        }
        firstVisibleUser = snapshot.docs[0];
        lastVisibleUser = snapshot.docs[snapshot.docs.length - 1];
        usersTableBody.innerHTML = '';
        snapshot.docs.forEach(doc => {
            const user = doc.data();
            const row = document.createElement('tr');
            row.className = `border-b hover:bg-gray-50 ${user.isSuspended ? 'bg-red-100' : ''}`;
            
            const expirationDate = user.subscriptionExpiresAt ? user.subscriptionExpiresAt.toDate() : null;
            const isExpired = expirationDate && expirationDate < new Date();
            let expirationText = 'N/A';
            let expirationClass = 'text-gray-500';

            if (expirationDate) {
                expirationText = expirationDate.toLocaleDateString('pt-BR');
                if (isExpired) {
                    expirationClass = 'text-red-500 font-bold';
                } else {
                    expirationClass = 'text-green-600';
                }
            }

            row.innerHTML = `
                <td class="p-4 flex items-center gap-3">
                    <img src="${user.photoURL}" alt="${user.displayName}" class="w-10 h-10 rounded-full">
                    <span>${user.displayName}</span>
                </td>
                <td class="p-4">${user.email}</td>
                <td class="p-4"><span class="px-2 py-1 text-xs rounded-full ${user.userRole === 'locador' ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-800'}">${user.userRole}</span></td>
                <td class="p-4 ${expirationClass}">${expirationText}</td>
                <td class="p-4 space-x-2">
                    <button data-uid="${user.uid}" data-name="${user.displayName}" class="activate-subscription-btn bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded-md text-sm">Ativar/Renovar</button>
                    <button data-uid="${user.uid}" data-status="${user.isSuspended ? 'true' : 'false'}" class="suspend-user-btn ${user.isSuspended ? 'bg-green-500 hover:bg-green-600' : 'bg-yellow-500 hover:bg-yellow-600'} text-white px-3 py-1 rounded-md text-sm">${user.isSuspended ? 'Reativar' : 'Suspender'}</button>
                    <button data-uid="${user.uid}" class="delete-user-btn bg-red-500 text-white px-3 py-1 rounded-md text-sm hover:bg-red-600">Excluir</button>
                </td>
            `;
            usersTableBody.appendChild(row);
        });
    });
}

function loadItems(direction = 'first') {
    let q;
     if (direction === 'next' && lastVisibleItem) {
        q = query(collection(db, "items"), orderBy("createdAt", "desc"), startAfter(lastVisibleItem), limit(PAGE_SIZE));
    } else if (direction === 'prev' && firstVisibleItem) {
        q = query(collection(db, "items"), orderBy("createdAt"), endBefore(firstVisibleItem), limit(PAGE_SIZE));
    } else {
        q = query(collection(db, "items"), orderBy("createdAt", "desc"), limit(PAGE_SIZE));
    }

    onSnapshot(q, (snapshot) => {
        if (snapshot.empty && direction !== 'first') {
            alert("Não há mais itens para mostrar.");
            return;
        }
        firstVisibleItem = snapshot.docs[0];
        lastVisibleItem = snapshot.docs[snapshot.docs.length - 1];
        itemsTableBody.innerHTML = '';
        snapshot.forEach(doc => {
            const item = doc.data();
            const row = document.createElement('tr');
            row.className = `border-b hover:bg-gray-50 ${item.isFeatured ? 'bg-blue-100' : ''}`;
            row.innerHTML = `
                <td class="p-4"><input type="text" value="${item.itemName}" data-field="itemName" class="admin-edit-field bg-transparent w-full border-b border-transparent focus:border-gray-300 outline-none"></td>
                <td class="p-4 font-mono text-xs">${item.ownerId}</td>
                <td class="p-4">R$ <input type="number" value="${Number(item.pricePerDay).toFixed(2)}" data-field="pricePerDay" class="admin-edit-field bg-transparent w-20 border-b border-transparent focus:border-gray-300 outline-none"></td>
                <td class="p-4 space-x-2">
                    <button data-id="${doc.id}" class="save-item-btn bg-green-500 text-white px-3 py-1 rounded-md text-sm hover:bg-green-600">Salvar</button>
                    <button data-id="${doc.id}" data-status="${item.isFeatured ? 'true' : 'false'}" class="feature-item-btn ${item.isFeatured ? 'bg-gray-500 hover:bg-gray-600' : 'bg-blue-500 hover:bg-blue-600'} text-white px-3 py-1 rounded-md text-sm">${item.isFeatured ? 'Remover Destaque' : 'Destacar'}</button>
                    <button data-id="${doc.id}" class="delete-item-btn bg-red-500 text-white px-3 py-1 rounded-md text-sm hover:bg-red-600">Excluir</button>
                </td>
            `;
            itemsTableBody.appendChild(row);
        });
    });
}

function loadReviews() {
    onSnapshot(query(collection(db, "reviews"), orderBy("createdAt", "desc"), limit(20)), (snapshot) => {
        reviewsTableBody.innerHTML = '';
        snapshot.forEach(doc => {
            const review = doc.data();
            const row = document.createElement('tr');
            row.className = 'border-b hover:bg-gray-50';
            row.innerHTML = `
                <td class="p-4">${'⭐'.repeat(review.rating)}</td>
                <td class="p-4">${review.comment || '<i>Sem comentário</i>'}</td>
                <td class="p-4 font-mono text-xs">${review.itemId}</td>
                <td class="p-4">
                    <button data-id="${doc.id}" class="delete-review-btn bg-red-500 text-white px-3 py-1 rounded-md text-sm hover:bg-red-600">Excluir</button>
                </td>
            `;
            reviewsTableBody.appendChild(row);
        });
    });
}

function updateCategoryChart(categoryData) {
    if (categoryChart) {
        categoryChart.destroy();
    }
    categoryChart = new Chart(chartCanvas, {
        type: 'bar',
        data: {
            labels: Object.keys(categoryData),
            datasets: [{
                label: 'Nº de Itens',
                data: Object.values(categoryData),
                backgroundColor: 'rgba(79, 70, 229, 0.8)',
                borderColor: 'rgba(79, 70, 229, 1)',
                borderWidth: 1
            }]
        },
        options: {
            scales: { y: { beginAtZero: true } },
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

// --- Funções de Ações do Admin ---
async function activateSubscription(uid) {
    const plan = subscriptionPlanSelect.value;
    const now = new Date();
    let expirationDate = new Date(now);

    switch (plan) {
        case 'mensal':
            expirationDate.setMonth(now.getMonth() + 1);
            break;
        case 'semestral':
            expirationDate.setMonth(now.getMonth() + 6);
            break;
        case 'anual':
            expirationDate.setFullYear(now.getFullYear() + 1);
            break;
        default:
            alert('Plano inválido selecionado.');
            return;
    }
    
    try {
        const userRef = doc(db, "users", uid);
        await updateDoc(userRef, {
            userRole: 'locador',
            subscriptionExpiresAt: expirationDate,
            isSuspended: false // Garante que o utilizador não está suspenso na ativação
        });
        alert(`Assinatura ativada para ${uid} até ${expirationDate.toLocaleDateString('pt-BR')}.`);
        subscriptionModal.classList.add('hidden');
    } catch (error) {
        console.error("Erro ao ativar assinatura:", error);
        alert("Falha ao ativar a assinatura.");
    }
}


async function updateItemFromAdmin(itemId, rowElement) {
    const updatedData = {};
    rowElement.querySelectorAll('.admin-edit-field').forEach(input => {
        const field = input.dataset.field;
        let value = input.value;
        if (input.type === 'number') {
            value = parseFloat(value);
        }
        updatedData[field] = value;
    });

    try {
        await updateDoc(doc(db, "items", itemId), updatedData);
        alert(`Item ${itemId} atualizado com sucesso!`);
    } catch (error) {
        console.error("Erro ao atualizar item:", error);
        alert("Falha ao atualizar o item.");
    }
}

async function toggleUserSuspension(uid, currentStatus) {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, { isSuspended: !currentStatus });
}

async function toggleItemFeature(itemId, currentStatus) {
    const itemRef = doc(db, "items", itemId);
    await updateDoc(itemRef, { isFeatured: !currentStatus });
}

async function deleteItem(itemId) {
    if (window.confirm(`Tem a certeza que deseja excluir o item ${itemId}?`)) {
        try {
            await deleteDoc(doc(db, "items", itemId));
        } catch (error) {
            console.error("Erro ao excluir item:", error);
        }
    }
}

async function deleteUserAndData(userId) {
    if (window.confirm(`ATENÇÃO: Excluir o utilizador ${userId} também irá excluir TODOS os seus anúncios. Deseja continuar?`)) {
        try {
            const itemsQuery = query(collection(db, "items"), where("ownerId", "==", userId));
            const querySnapshot = await getDocs(itemsQuery);
            const deletePromises = querySnapshot.docs.map(d => deleteDoc(d.ref));
            await Promise.all(deletePromises);
            
            await deleteDoc(doc(db, "users", userId));
            alert("Utilizador e todos os seus dados foram removidos do Firestore.");
        } catch (error) {
            console.error("Erro ao excluir utilizador e seus dados:", error);
        }
    }
}

async function deleteReview(reviewId) {
    if (!window.confirm(`Tem a certeza que deseja excluir esta avaliação?`)) return;
    try {
        const reviewRef = doc(db, "reviews", reviewId);
        const reviewSnap = await getDoc(reviewRef);
        if (!reviewSnap.exists()) return;
        const { itemId } = reviewSnap.data();
        
        await deleteDoc(reviewRef);
        await recalculateItemRating(itemId);
        alert('Avaliação excluída e classificação do item recalculada.');
    } catch (error) {
        console.error("Erro ao excluir avaliação:", error);
        alert('Falha ao excluir avaliação.');
    }
}

async function recalculateItemRating(itemId) {
    const itemRef = doc(db, "items", itemId);
    const reviewsQuery = query(collection(db, "reviews"), where("itemId", "==", itemId));
    const reviewsSnapshot = await getDocs(reviewsQuery);
    
    if (reviewsSnapshot.empty) {
        await updateDoc(itemRef, { averageRating: 0, reviewCount: 0 });
        return;
    }
    
    const totalRating = reviewsSnapshot.docs.reduce((sum, doc) => sum + doc.data().rating, 0);
    const newReviewCount = reviewsSnapshot.size;
    const newAverageRating = totalRating / newReviewCount;
    
    await updateDoc(itemRef, { averageRating: newAverageRating, reviewCount: newReviewCount });
}

// --- Event Listeners ---
usersPagination.innerHTML = `
    <button id="prevUsers" class="bg-gray-300 px-3 py-1 rounded-md text-sm">Anterior</button>
    <button id="nextUsers" class="bg-gray-300 px-3 py-1 rounded-md text-sm">Próximo</button>
`;
itemsPagination.innerHTML = `
    <button id="prevItems" class="bg-gray-300 px-3 py-1 rounded-md text-sm">Anterior</button>
    <button id="nextItems" class="bg-gray-300 px-3 py-1 rounded-md text-sm">Próximo</button>
`;

usersPagination.addEventListener('click', (e) => {
    if (e.target.id === 'nextUsers') loadUsers('next');
    if (e.target.id === 'prevUsers') loadUsers('prev');
});

itemsPagination.addEventListener('click', (e) => {
    if (e.target.id === 'nextItems') loadItems('next');
    if (e.target.id === 'prevItems') loadItems('prev');
});

usersTableBody.addEventListener('click', (e) => {
    const target = e.target;
    if (target.classList.contains('suspend-user-btn')) {
        const status = target.dataset.status === 'true';
        toggleUserSuspension(target.dataset.uid, status);
    }
    if (target.classList.contains('delete-user-btn')) {
        deleteUserAndData(target.dataset.uid);
    }
    if (target.classList.contains('activate-subscription-btn')) {
        const uid = target.dataset.uid;
        const name = target.dataset.name;
        modalUserName.textContent = name;
        confirmSubscriptionBtn.dataset.uid = uid;
        subscriptionModal.classList.remove('hidden');
    }
});

itemsTableBody.addEventListener('click', (e) => {
    const button = e.target;
    if (button.classList.contains('delete-item-btn')) {
        deleteItem(button.dataset.id);
    }
    if (button.classList.contains('save-item-btn')) {
        const row = button.closest('tr');
        updateItemFromAdmin(button.dataset.id, row);
    }
    if (button.classList.contains('feature-item-btn')) {
        const status = button.dataset.status === 'true';
        toggleItemFeature(button.dataset.id, status);
    }
});

reviewsTableBody.addEventListener('click', (e) => {
    if (e.target.classList.contains('delete-review-btn')) {
        deleteReview(e.target.dataset.id);
    }
});

// Event Listeners para o Modal de Assinatura
cancelSubscriptionBtn.addEventListener('click', () => {
    subscriptionModal.classList.add('hidden');
});

confirmSubscriptionBtn.addEventListener('click', () => {
    const uid = confirmSubscriptionBtn.dataset.uid;
    if (uid) {
        activateSubscription(uid);
    }
});