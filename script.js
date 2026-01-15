const { createClient } = supabase;
// ⚠️ เปลี่ยน URL/KEY ของคุณที่นี่
const supabaseUrl = 'https://crogaiqfxaaydpfmoqbc.supabase.co'; 
const supabaseKey = 'sb_publishable_85_6DqvJkJo3t93qH0K31A_PbGQIaRw';
const _supabase = createClient(supabaseUrl, supabaseKey);

const { createApp, ref, computed, watch, onMounted } = Vue;

createApp({
    setup() {
        // ================== ZONE 1: CONFIG ==================
        const statusOptions = {
            'waiting_approval': { label: 'รออนุมัติ', class: 'bg-gray-200 text-gray-700' },
            'received':         { label: 'เข้าสู่ระบบแล้ว', class: 'bg-blue-100 text-blue-700' },
            'queueing':         { label: 'รอคิวปริ้น', class: 'bg-yellow-100 text-yellow-700' },
            'printing':         { label: 'กำลังปริ้น', class: 'bg-purple-100 text-purple-700' },
            'completed':        { label: 'เสร็จแล้ว', class: 'bg-green-100 text-green-700' },
            'cancelled':        { label: 'ยกเลิก', class: 'bg-red-100 text-red-700' },
        };
        const itemsPerPage = 25;

        // ================== ZONE 2: STATE ==================
        const session = ref(null);
        const userProfile = ref({ role: 'user', email: '', display_name: '' });
        const loginData = ref({ email: '', password: '' });
        const provider = ref({}); 
        
        const customers = ref([]);
        const services = ref([]);
        const jobHistory = ref([]);
        const currentPage = ref('dashboard');
        const showPreview = ref(false);
        const isHistoryView = ref(false);
        
        const orderForm = ref({ customerType: 'general', selectedCustomer: null, customerName: '', branch: '', eventName: '', eventDate: '', items: [] });
        const newService = ref({ name: '', price: '' });
        const generatedJobId = ref('');
        const searchQuery = ref('');
        const statusFilter = ref('');
        const currentPageNum = ref(1);

        const toast = ref({ visible: false, message: '', type: 'success' });
        // เพิ่ม State สำหรับ Modal ต่างๆ
        const confirmModal = ref({ isOpen: false, message: '', onConfirm: null });
        const customerModal = ref({ isOpen: false, data: { id: null, name: '', phone: '', address: '', tax_id: '' } });
        const statusModal = ref({ isOpen: false, job: null, currentStatus: '' });

        // ================== ZONE 3: HELPERS ==================
        const showToast = (msg, type = 'success') => { toast.value = { visible: true, message: msg, type: type }; setTimeout(() => { toast.value.visible = false; }, 3000); };
        
        // ฟังก์ชันยืนยัน (Confirm)
        const confirmAction = (msg, cb) => { 
            confirmModal.value = { isOpen: true, message: msg, onConfirm: cb }; 
        };
        const handleConfirmAction = () => { 
            if (confirmModal.value.onConfirm) confirmModal.value.onConfirm(); 
            confirmModal.value.isOpen = false; 
        };
        
        const formatDate = (d) => d ? new Date(d).toLocaleDateString('th-TH') : '-';
        const formatCurrency = (a) => (a || 0).toLocaleString();

        const isAdmin = computed(() => userProfile.value.role === 'admin');
        const canManageStock = computed(() => ['admin', 'user'].includes(userProfile.value.role));

        const grandTotal = computed(() => orderForm.value.items.reduce((sum, item) => sum + item.total, 0));

        // ================== ZONE 4: INVENTORY INTEGRATION ==================
        const inventory = typeof useInventory !== 'undefined' 
            ? useInventory(_supabase, userProfile, showToast, confirmAction) 
            : {}; 

        // ================== ZONE 5: AUTH & DATA LOAD ==================
        onMounted(async () => {
            const { data } = await _supabase.auth.getSession();
            if (data.session) { session.value = data.session; await fetchUserProfile(); await loadInitialData(); }
        });
        const handleLogin = async () => { const { data, error } = await _supabase.auth.signInWithPassword(loginData.value); if (error) showToast(error.message, 'error'); else { session.value = data.session; await fetchUserProfile(); await loadInitialData(); showToast("Login Success"); } };
        const handleLogout = async () => { await _supabase.auth.signOut(); session.value = null; };
        const fetchUserProfile = async () => { const { data: { user } } = await _supabase.auth.getUser(); const { data } = await _supabase.from('profiles').select('*').eq('id', user.id).single(); userProfile.value = { ...user, role: data ? data.role : 'user', display_name: data?.display_name || user.email }; };
        const editDisplayName = async () => { const n = prompt("Display Name:", userProfile.value.display_name); if (n && n.trim()) { await _supabase.from('profiles').update({ display_name: n }).eq('id', userProfile.value.id); fetchUserProfile(); } };

        const loadInitialData = async () => {
            const { data: pData } = await _supabase.from('provider_info').select('*').single(); if(pData) provider.value = pData;
            const { data: sData } = await _supabase.from('services').select('*').order('service_name'); services.value = sData || [];
            const { data: cData } = await _supabase.from('customers').select('*').order('name'); customers.value = cData || [];
            if (canManageStock.value && inventory.fetchMaterials) {
                inventory.fetchMaterials();
            }
        };

        // ================== ZONE 6: ORDER LOGIC ==================
        const goToOrder = () => { resetOrder(); currentPage.value = 'order'; };
        const addItem = () => { if(orderForm.value.items.length >= 30) return showToast('Limit 30 items', 'error'); orderForm.value.items.push({ service: services.value[0] || {}, customName: '', w: 0, h: 0, unit: 'cm', qty: 1, base_price: 0, price: 0, total: 0, note: '' }); updatePrice(orderForm.value.items[orderForm.value.items.length - 1]); };
        const removeItem = (i) => { if(orderForm.value.items[i].total === 0) orderForm.value.items.splice(i, 1); else confirmAction("ลบรายการนี้?", () => orderForm.value.items.splice(i, 1)); };
        const updatePrice = (i) => { i.base_price = (i.service.service_name === 'อื่นๆ') ? 0 : (i.service.unit_price || 0); if(i.service.service_name === 'อื่นๆ') i.price = 0; calcRow(i, 'size'); };
        const calcRow = (i, t) => { let wm = (i.unit === 'cm') ? i.w / 100 : i.w; let hm = (i.unit === 'cm') ? i.h / 100 : i.h; let area = wm * hm; if (t === 'size') i.price = (area > 0 && i.base_price > 0) ? Math.ceil(area * i.base_price) : Math.ceil(i.base_price); i.total = i.price * i.qty; };
        const fillCustomerInfo = () => { if(orderForm.value.selectedCustomer) { const c = orderForm.value.selectedCustomer; orderForm.value.customerName = c.name; orderForm.value.branch = c.address + (c.tax_id ? ` (Tax: ${c.tax_id})` : ''); } };
        const generateJobIdFunc = async () => { const d = new Date(); const p = `${String(d.getDate()).padStart(2,'0')}${String(d.getMonth()+1).padStart(2,'0')}${d.getFullYear()+543}`; const { data } = await _supabase.from('job_orders').select('job_id').ilike('job_id', `${p}%`).order('job_id', { ascending: false }).limit(1); return `${p}${data && data.length > 0 ? String(parseInt(data[0].job_id.slice(-2)) + 1).padStart(2, '0') : '00'}`; };
        const preparePreview = async () => { if(!orderForm.value.items.length) return showToast('เพิ่มรายการก่อน', 'error'); if(!orderForm.value.customerName) return showToast('ระบุลูกค้า', 'error'); if(!generatedJobId.value && !isHistoryView.value) generatedJobId.value = await generateJobIdFunc(); showPreview.value = true; };
        const submitOrder = async () => { if (!orderForm.value.eventDate || !orderForm.value.customerName) return showToast('กรอกข้อมูลให้ครบ', 'error'); confirmAction("ยืนยันสั่งงาน?", async () => { const payload = { job_id: generatedJobId.value, customer_name: orderForm.value.customerName, branch: orderForm.value.branch, event_name: orderForm.value.eventName, event_date: orderForm.value.eventDate, items: orderForm.value.items, total_price: grandTotal.value, created_by: userProfile.value.display_name || userProfile.value.email, status: 'waiting_approval' }; const { error } = await _supabase.from('job_orders').insert(payload); if(error) showToast('Error: ' + error.message, 'error'); else { showToast('บันทึกแล้ว!'); resetOrder(); currentPage.value = 'dashboard'; } }); };
        const resetOrder = () => { orderForm.value = { customerType: 'general', selectedCustomer: null, customerName: '', branch: '', eventName: '', eventDate: '', items: [] }; showPreview.value = false; generatedJobId.value = ''; isHistoryView.value = false; };

        // ================== ZONE 7: HISTORY ==================
        const fetchHistory = async () => { currentPage.value = 'history'; const { data } = await _supabase.from('job_orders').select('*').order('created_at', { ascending: false }); jobHistory.value = data; };
        const filteredHistory = computed(() => jobHistory.value.filter(j => { const q = searchQuery.value.toLowerCase(); return (j.job_id.toLowerCase().includes(q) || (j.customer_name && j.customer_name.toLowerCase().includes(q))) && (!statusFilter.value || j.status === statusFilter.value); }));
        const totalPages = computed(() => Math.ceil(filteredHistory.value.length / itemsPerPage) || 1);
        const paginatedHistory = computed(() => filteredHistory.value.slice((currentPageNum.value - 1) * itemsPerPage, currentPageNum.value * itemsPerPage));
        watch([searchQuery, statusFilter], () => { currentPageNum.value = 1; });
        const changePage = (p) => { if (p >= 1 && p <= totalPages.value) currentPageNum.value = p; };
        const viewJob = (j) => { orderForm.value = { customerName: j.customer_name, branch: j.branch, eventName: j.event_name, eventDate: j.event_date, items: j.items }; generatedJobId.value = j.job_id; isHistoryView.value = true; currentPage.value = 'order'; showPreview.value = true; };
        const printJob = (j) => { viewJob(j); setTimeout(() => window.print(), 500); };
        
        // [FIX Bug 3] Status Modal Logic
        const openStatusModal = (j) => { statusModal.value = { isOpen: true, job: j, currentStatus: j.status || 'waiting_approval' }; };
        const saveStatusChange = async () => { 
            const j = statusModal.value.job; 
            const s = statusModal.value.currentStatus;
            statusModal.value.isOpen = false; 
            confirmAction(`ยืนยันเปลี่ยนสถานะเป็น "${statusOptions[s].label}"?`, async () => { 
                await _supabase.from('job_orders').update({ status: s }).eq('job_id', j.job_id); 
                showToast('เรียบร้อย'); 
                fetchHistory(); 
            }); 
        };

        // ================== ZONE 8: ADMIN CRUD ==================
        const goToServices = () => currentPage.value = 'services';
        const goToCustomers = () => currentPage.value = 'customers';
        const addService = async () => { if (!newService.value.name) return showToast("กรอกชื่อบริการ", 'error'); await _supabase.from('services').insert({ service_name: newService.value.name, unit_price: parseFloat(newService.value.price) }); showToast("เพิ่มแล้ว"); loadInitialData(); newService.value = {name:'', price:''}; };
        const deleteService = async(id) => confirmAction("ลบ?", async () => { await _supabase.from('services').delete().eq('id', id); loadInitialData(); });
        
        // [FIX Bug 4] Pricing Confirm
        const updateServicePrice = (s, event) => {
             // เก็บค่าเดิมเผื่อ user cancel
             const newVal = parseFloat(event.target.value);
             confirmAction(`ยืนยันเปลี่ยนราคาบริการนี้เป็น ${newVal} บาท?`, async () => {
                const { error } = await _supabase.from('services').update({unit_price: newVal}).eq('id', s.id);
                if(!error) {
                    s.unit_price = newVal; // Update local state
                    showToast('บันทึกราคาแล้ว');
                } else {
                    showToast(error.message, 'error');
                }
             });
        };

        const deleteCustomer = async(id) => confirmAction("ลบ?", async () => { await _supabase.from('customers').delete().eq('id', id); loadInitialData(); });
        
        // [FIX Bug 2] Customer Modal Logic
        const openCustomerModal = (c) => { 
            customerModal.value.data = c ? JSON.parse(JSON.stringify(c)) : { id: null, name: '', phone: '', address: '', tax_id: '' }; 
            customerModal.value.isOpen = true; 
        };
        
        const submitCustomerModal = async () => { 
            const d = customerModal.value.data; 
            if(!d.name) return showToast('กรอกชื่อ', 'error'); 
            const q = d.id ? _supabase.from('customers').update(d).eq('id', d.id) : _supabase.from('customers').insert(d); 
            const { error } = await q; 
            if(!error) { loadInitialData(); customerModal.value.isOpen = false; showToast('เรียบร้อย'); }
            else { showToast(error.message, 'error'); }
        };

        return {
            session, loginData, userProfile, currentPage, provider,
            customers, services, jobHistory, orderForm, newService,
            isAdmin, canManageStock, grandTotal, showPreview, generatedJobId, isHistoryView, statusOptions,
            toast, confirmModal, customerModal, statusModal,
            handleLogin, handleLogout, editDisplayName,
            goToOrder, goToCustomers, goToServices,
            addItem, removeItem, updatePrice, calcRow, fillCustomerInfo, preparePreview, submitOrder, resetOrder,
            fetchHistory, viewJob, printJob, openStatusModal, saveStatusChange,
            addService, deleteService, updateServicePrice, deleteCustomer, openCustomerModal, submitCustomerModal,
            handleConfirmAction, formatDate, formatCurrency,
            searchQuery, statusFilter, filteredHistory, paginatedHistory, currentPageNum, totalPages, changePage,
            ...inventory 
        };
    }
}).mount('#app');