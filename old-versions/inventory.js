// ============ INVENTORY CONFIGURATION CONSTANTS ============
const MATERIAL_CATEGORIES = ['ไวนิล', 'สติกเกอร์', 'หมึกพิมพ์', 'อุปกรณ์ประกอบ', 'อื่นๆ'];

const MATERIAL_TYPES = [
    { id: 'roll', label: 'ม้วน (คำนวณ ตร.ม.)' },
    { id: 'piece', label: 'ชิ้น (ตัดใช้เป็นชิ้น)' },
    { id: 'pack', label: 'หน่วย/แพ็ค (เบิกทั้งหน่วย)' }
];

const INVENTORY_CONFIG = {
    LOGS_PER_PAGE: 50,
    DEFAULT_UNIT: 'ชิ้น',
    ROLL_UNIT: 'ตร.ม.'
};

// ============ INVENTORY COMPOSABLE ============
function useInventory(_supabase, userProfile, showToast, confirmAction, isLoading) {
    const { ref, computed, watch } = Vue;

    // ================== STATE ==================
    const materials = ref([]);
    const materialLogs = ref([]);
    const materialCategories = ref(MATERIAL_CATEGORIES);
    const materialTypes = ref(MATERIAL_TYPES);

    // UI States for Materials View
    const materialSearch = ref('');
    const viewMode = ref('grid');
    const activeTab = ref('printing');

    // UI States for Logs View
    const logSearch = ref('');
    const logCategoryFilter = ref('');
    const logMonthFilter = ref('');
    const currentLogPage = ref(1);

    // Modal States
    const materialModal = ref({ isOpen: false, mode: 'add', data: {} });
    const stockActionModal = ref({ isOpen: false, type: 'IN', data: {} });

    // ================== COMPUTED PROPERTIES ==================
    const sortedMaterials = computed(() => {
        if (!materials.value) return [];
        let items = materials.value.filter(m => !m.is_deleted);

        // Filter by active tab (printing vs. consumables)
        if (activeTab.value === 'printing') {
            items = items.filter(m => m.type === 'roll');
        } else {
            items = items.filter(m => m.type !== 'roll');
        }

        // Filter by search query
        const query = materialSearch.value.toLowerCase().trim();
        if (query) {
            items = items.filter(m =>
                (m.name || '').toLowerCase().includes(query) ||
                (m.brand || '').toLowerCase().includes(query) ||
                (m.category || '').toLowerCase().includes(query)
            );
        }

        // Sort by: out of stock first, then low stock, then by category
        items.sort((a, b) => {
            // Prioritize out of stock items
            if (a.remaining_qty === 0 && b.remaining_qty !== 0) return -1;
            if (b.remaining_qty === 0 && a.remaining_qty !== 0) return 1;

            // Prioritize low stock items
            const aLow = a.remaining_qty <= a.min_alert;
            const bLow = b.remaining_qty <= b.min_alert;
            if (aLow && !bLow) return -1;
            if (!aLow && bLow) return 1;

            // Sort by category
            return a.category.localeCompare(b.category);
        });

        return items;
    });

    // [ใหม่] คำนวณยอดรวม 3 ยอด (In, Out, Balance) เป็นตัวเงิน
    const totalStockValue = computed(() => {
        return sortedMaterials.value.reduce((sum, m) => sum + (m.remaining_qty * (m.cost_per_unit || 0)), 0);
    });
    const totalInValue = computed(() => {
        return sortedMaterials.value.reduce((sum, m) => sum + ((m.total_in || 0) * (m.cost_per_unit || 0)), 0);
    });
    const totalOutValue = computed(() => {
        return sortedMaterials.value.reduce((sum, m) => sum + ((m.total_out || 0) * (m.cost_per_unit || 0)), 0);
    });

    const filteredLogs = computed(() => {
        if (!materialLogs.value) return [];
        const query = (logSearch.value || '').toLowerCase().trim();
        const categoryFilter = logCategoryFilter.value;
        const monthFilter = logMonthFilter.value;

        return materialLogs.value.filter(log => {
            const material = materials.value.find(x => x.id === log.material_id) || {};
            const materialName = material.name ||
                (log.note && log.note.includes('Deleted') ? 'รายการถูกลบ' : 'Unknown/Deleted');

            // Check search match
            const matchesSearch = !query ||
                materialName.toLowerCase().includes(query) ||
                (log.note || '').toLowerCase().includes(query);

            // Check category filter
            const matchesCategory = !categoryFilter || material.category === categoryFilter;

            // Check month filter
            let matchesMonth = true;
            if (monthFilter && log.action_date) {
                matchesMonth = log.action_date.startsWith(monthFilter);
            }

            return matchesSearch && matchesCategory && matchesMonth;
        });
    });

    const totalLogPages = computed(() => {
        return Math.ceil(filteredLogs.value.length / INVENTORY_CONFIG.LOGS_PER_PAGE) || 1;
    });

    const paginatedLogs = computed(() => {
        const start = (currentLogPage.value - 1) * INVENTORY_CONFIG.LOGS_PER_PAGE;
        return filteredLogs.value.slice(start, start + INVENTORY_CONFIG.LOGS_PER_PAGE);
    });

    // Reset pagination when filters change
    watch([logSearch, logCategoryFilter, logMonthFilter], () => {
        currentLogPage.value = 1;
    });

    // ================== ACTION FUNCTIONS ==================
    const fetchMaterials = async () => {
        try {
            const { data, error } = await _supabase.from('materials').select('*');
            if (error) throw error;
            materials.value = data || [];
        } catch (e) {
            console.error('Error fetching materials:', e);
            showToast('ไม่สามารถโหลดข้อมูลวัสดุ', 'error');
        }
    };

    const fetchLogs = async () => {
        try {
            const { data, error } = await _supabase
                .from('material_logs')
                .select('*')
                .order('action_date', { ascending: false })
                .limit(1000);
            if (error) throw error;
            materialLogs.value = data || [];
        } catch (e) {
            console.error('Error fetching logs:', e);
            showToast('ไม่สามารถโหลดประวัติการจัดการสต็อก', 'error');
        }
    };

    const changeLogPage = (pageNum) => {
        let newPage = pageNum;
        if (newPage < 1) newPage = 1;
        if (newPage > totalLogPages.value) newPage = totalLogPages.value;
        currentLogPage.value = newPage;
    };

    const exportLogsCSV = () => {
        const dataToExport = filteredLogs.value;
        if (dataToExport.length === 0) {
            return showToast('ไม่พบข้อมูล', 'error');
        }

        const headers = 'วันที่,รายการ,หมวดหมู่,ประเภท,จำนวน,ทุน,รวม,คงเหลือ,รายละเอียด,ผู้ทำ';
        const csvContent = dataToExport
            .map(log => {
                const material = materials.value.find(m => m.id === log.material_id) || {};
                return [
                    log.action_date ? log.action_date.slice(0, 10) : '-',
                    `"${(material.name || '-').replace(/"/g, '""')}"`,
                    material.category || '-',
                    log.action_type,
                    log.qty_change,
                    material.cost_per_unit || 0,
                    log.qty_change * (material.cost_per_unit || 0),
                    log.current_qty_snapshot,
                    `"${(log.note || '').replace(/"/g, '""')}"`,
                    log.action_by
                ].join(',');
            })
            .join('\n');

        const csvData = `\uFEFF${headers}\n${csvContent}`;
        const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'stock_logs.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const getDefaultMaterialData = () => ({
        name: '',
        category: MATERIAL_CATEGORIES[0],
        type: 'roll',
        brand: '',
        supplier: '',
        details: '',
        width: 0,
        remaining_qty: 0,
        min_alert: 5,
        unit: '',
        cost_per_unit: 0,
        image_url: ''
    });

    const openMaterialModal = (mode, item = null) => {
        materialModal.value.mode = mode;
        materialModal.value.isOpen = true;
        materialModal.value.data = (mode === 'edit' && item)
            ? { ...item }
            : getDefaultMaterialData();
    };

    const saveMaterial = async () => {
        if (isLoading.value) return;

        const materialData = materialModal.value.data;

        // Validation
        if (!materialData.name) {
            return showToast('ระบุชื่อวัสดุ', 'error');
        }

        // Set unit based on material type
        if (materialData.type === 'roll') {
            materialData.unit = INVENTORY_CONFIG.ROLL_UNIT;
        } else if (!materialData.unit) {
            materialData.unit = INVENTORY_CONFIG.DEFAULT_UNIT;
        }

        // Prepare payload
        const payload = {
            name: materialData.name,
            category: materialData.category,
            type: materialData.type,
            brand: materialData.brand,
            supplier: materialData.supplier,
            details: materialData.details,
            width: parseFloat(materialData.width || 0),
            remaining_qty: parseFloat(materialData.remaining_qty || 0),
            unit: materialData.unit,
            cost_per_unit: parseFloat(materialData.cost_per_unit || 0),
            min_alert: parseFloat(materialData.min_alert || 0),
            image_url: materialData.image_url,
            is_deleted: false
        };

        isLoading.value = true;
        try {
            let result;
            if (materialModal.value.mode === 'add') {
                result = await _supabase.from('materials').insert(payload).select().single();

                if (!result.error && result.data) {
                    // Log the material creation
                    await _supabase.from('material_logs').insert({
                        material_id: result.data.id,
                        action_type: 'CREATE',
                        qty_change: parseFloat(materialData.remaining_qty || 0),
                        current_qty_snapshot: parseFloat(materialData.remaining_qty || 0),
                        note: 'เพิ่มใหม่',
                        action_by: userProfile.value.display_name,
                        action_date: new Date().toISOString()
                    });
                }
            } else {
                result = await _supabase.from('materials').update(payload).eq('id', materialData.id);
            }

            if (result.error) throw result.error;

            showToast('บันทึกเรียบร้อย');
            materialModal.value.isOpen = false;
            await fetchMaterials();
        } catch (e) {
            console.error('Error saving material:', e);
            showToast(`ไม่สามารถบันทึก: ${e.message}`, 'error');
        } finally {
            isLoading.value = false;
        }
    };

    const deleteMaterial = (id) => {
        if (typeof confirmAction !== 'function') return;
        confirmAction('ต้องการลบรายการนี้ใช่ไหม?', async () => {
            const { error } = await _supabase.from('materials').update({ is_deleted: true }).eq('id', id);
            if (!error) {
                await _supabase.from('material_logs').insert({
                    material_id: id, action_type: 'DELETE', qty_change: 0, current_qty_snapshot: 0,
                    note: 'ลบรายการ', action_by: userProfile.value.display_name, action_date: new Date().toISOString()
                });
                showToast('ลบเรียบร้อย');
                fetchMaterials();
            } else { showToast(error.message, 'error'); }
        });
    };

    const openStockAction = (type, item) => {
        stockActionModal.value = {
            isOpen: true, type: type, material: item,
            data: { qty: 0, length: 0, date: new Date().toISOString().split('T')[0], user: userProfile.value.display_name, note: '' }
        };
    };

    const submitStockAction = async () => {
        if (isLoading.value) return; 
        const { type, material, data } = stockActionModal.value;
        const inputQty = parseFloat(data.qty || 0);
        const inputLength = parseFloat(data.length || 0);
        let finalQtyChange = 0;
        let noteText = data.note;

        if (material.type === 'roll') {
            if (inputLength <= 0) return showToast('ระบุความยาว', 'error');
            finalQtyChange = material.width * inputLength;
            noteText += ` (${type === 'IN' ? 'รับ' : 'เบิก'} ${inputLength}ม. x ${material.width}ม.)`;
        } else {
            if (inputQty <= 0) return showToast('ระบุจำนวน', 'error');
            finalQtyChange = inputQty;
        }

        if (type === 'OUT' && finalQtyChange > material.remaining_qty) {
            return showToast(`สต็อกไม่พอ (มี ${material.remaining_qty})`, 'error');
        }

        const newBalance = type === 'IN' ? parseFloat(material.remaining_qty) + finalQtyChange : parseFloat(material.remaining_qty) - finalQtyChange;
        const newTotalIn = type === 'IN' ? (material.total_in || 0) + finalQtyChange : material.total_in;
        const newTotalOut = type === 'OUT' ? (material.total_out || 0) + finalQtyChange : material.total_out;

        isLoading.value = true;
        try {
            const { error } = await _supabase.from('materials').update({ remaining_qty: newBalance, total_in: newTotalIn, total_out: newTotalOut }).eq('id', material.id);
            if(error) throw error;
            await _supabase.from('material_logs').insert({
                material_id: material.id, action_type: type, qty_change: finalQtyChange,
                width_used: material.type === 'roll' ? material.width : null, length_used: material.type === 'roll' ? inputLength : null,
                current_qty_snapshot: newBalance, note: noteText, action_by: data.user, action_date: data.date
            });
            showToast('เรียบร้อย', 'success');
            stockActionModal.value.isOpen = false;
            fetchMaterials();
        } catch(e) { showToast(e.message, 'error'); }
        finally { isLoading.value = false; }
    };

    return {
        materials, materialLogs, materialCategories, materialTypes,
        // UI State Variables
        materialSearch, viewMode, activeTab, sortedMaterials,
        totalStockValue, totalInValue, totalOutValue,
        logSearch, logCategoryFilter, logMonthFilter, currentLogPage, materialModal, stockActionModal,
        // Computed Properties
        filteredLogs, totalLogPages, paginatedLogs,
        // Action Functions
        fetchMaterials, fetchLogs, changeLogPage, exportLogsCSV,
        openMaterialModal, saveMaterial, deleteMaterial, openStockAction, submitStockAction
    };
}