// ไฟล์: inventory.js
function useInventory(_supabase, userProfile, showToast, confirmAction) {
    const { ref, computed, watch } = Vue;

    // --- STATE ---
    const materials = ref([]);
    const materialLogs = ref([]);
    const materialCategories = ref(['ไวนิล', 'สติกเกอร์', 'หมึกพิมพ์', 'อุปกรณ์ประกอบ', 'อื่นๆ']);
    const materialTypes = ref([
        { id: 'roll', label: 'ม้วน (คำนวณ ตร.ม.)' },
        { id: 'piece', label: 'ชิ้น (ตัดใช้เป็นชิ้น)' },
        { id: 'pack', label: 'หน่วย/แพ็ค (เบิกทั้งหน่วย)' }
    ]);

    // UI States
    const invSearch = ref('');
    const invCategoryFilter = ref('');
    const invMonthFilter = ref(''); 
    const invLogPage = ref(1);
    const logsPerPage = 50;

    // Modals
    const matModal = ref({ isOpen: false, mode: 'add', data: {} });
    const stockActionModal = ref({ isOpen: false, type: 'IN', data: {} });

    // --- COMPUTED ---
    const sortedMaterials = computed(() => {
        if (!materials.value) return [];
        let items = materials.value.filter(m => !m.is_deleted);
        items.sort((a, b) => {
            if (a.category !== b.category) return a.category.localeCompare(b.category);
            return (b.remaining_qty || 0) - (a.remaining_qty || 0);
        });
        return items;
    });

    const filteredLogs = computed(() => {
        if (!materialLogs.value) return [];
        
        const q = (invSearch.value || '').toLowerCase().trim();
        const catFilter = invCategoryFilter.value;
        const monthFilter = invMonthFilter.value;

        return materialLogs.value.filter(log => {
            const m = materials.value.find(x => x.id === log.material_id) || {};
            // ถ้าเป็นรายการที่ถูกลบไปแล้ว ให้พยายามหาชื่อจาก log note หรือแสดงชื่อเดิม
            const matName = m.name || (log.note && log.note.includes('Deleted') ? 'รายการถูกลบ' : 'Unknown/Deleted');
            const matCat = m.category || '';
            const logNote = log.note || '';

            const matchSearch = !q || matName.toLowerCase().includes(q) || logNote.toLowerCase().includes(q);
            const matchCat = !catFilter || matCat === catFilter;
            
            let matchMonth = true;
            if (monthFilter && log.action_date) {
                matchMonth = log.action_date.startsWith(monthFilter);
            }

            return matchSearch && matchCat && matchMonth;
        });
    });

    const totalLogPages = computed(() => Math.ceil(filteredLogs.value.length / logsPerPage) || 1);
    
    const paginatedLogs = computed(() => {
        const start = (invLogPage.value - 1) * logsPerPage;
        return filteredLogs.value.slice(start, start + logsPerPage);
    });

    watch([invSearch, invCategoryFilter, invMonthFilter], () => { invLogPage.value = 1; });

    // --- ACTIONS ---
    const fetchMaterials = async () => {
        const { data, error } = await _supabase.from('materials').select('*'); 
        if (!error) materials.value = data || [];
    };

    const fetchLogs = async () => {
        // ดึง 1000 รายการล่าสุด
        const { data, error } = await _supabase.from('material_logs').select('*').order('action_date', { ascending: false }).limit(1000);
        if (!error) materialLogs.value = data || [];
    };

    const changeLogPage = (p) => {
        if (p < 1) p = 1;
        if (p > totalLogPages.value) p = totalLogPages.value;
        invLogPage.value = p;
    };

    const exportLogsCSV = () => {
        const dataToExport = filteredLogs.value;
        if (dataToExport.length === 0) return showToast('ไม่พบข้อมูลตามเงื่อนไข', 'error');
        
        let csvContent = "\uFEFFวันที่,รายการ,หมวดหมู่,ประเภทการทำรายการ,จำนวน,ต้นทุน/หน่วย,รวมมูลค่า,คงเหลือ(ขณะนั้น),รายละเอียด,ผู้ทำ\n";
        
        dataToExport.forEach(log => {
            const mat = materials.value.find(m => m.id === log.material_id) || {};
            const date = log.action_date ? new Date(log.action_date).toLocaleDateString('th-TH') : '-';
            const cost = mat.cost_per_unit || 0;
            
            // แปลง Action Type เป็นภาษาไทย
            let actionLabel = 'อื่นๆ';
            if (log.action_type === 'IN') actionLabel = 'รับเข้า';
            else if (log.action_type === 'OUT') actionLabel = 'เบิกออก';
            else if (log.action_type === 'CREATE') actionLabel = 'เพิ่มใหม่';
            else if (log.action_type === 'DELETE') actionLabel = 'ลบรายการ';

            const row = [
                date, `"${(mat.name || 'Unknown/Deleted').replace(/"/g, '""')}"`, 
                mat.category || '-', 
                actionLabel,
                log.qty_change, 
                cost, 
                log.qty_change * cost, 
                log.current_qty_snapshot,
                `"${(log.note || '').replace(/"/g, '""')}"`, 
                log.action_by
            ].join(",");
            csvContent += row + "\n";
        });
        
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `stock_log_export.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const openMatModal = (mode, item = null) => {
        matModal.value.mode = mode;
        matModal.value.isOpen = true;
        if (mode === 'edit' && item) {
            matModal.value.data = { ...item }; 
        } else {
            matModal.value.data = { 
                name: '', category: 'ไวนิล', type: 'roll', 
                brand: '', supplier: '', details: '',
                width: 0, remaining_qty: 0, min_alert: 5, unit: '', cost_per_unit: 0, image_url: '' 
            };
        }
    };

    const saveMaterial = async () => {
        const d = matModal.value.data;
        if (!d.name) return showToast('ระบุชื่อวัสดุ', 'error');
        if (d.type === 'roll') d.unit = 'ตร.ม.';
        if (!d.unit) d.unit = 'ชิ้น';

        const payload = {
            name: d.name, category: d.category, type: d.type,
            brand: d.brand, supplier: d.supplier, details: d.details,
            width: parseFloat(d.width || 0),
            remaining_qty: parseFloat(d.remaining_qty || 0),
            unit: d.unit, cost_per_unit: parseFloat(d.cost_per_unit || 0),
            min_alert: parseFloat(d.min_alert || 0),
            image_url: d.image_url,
            is_deleted: false 
        };

        let res;
        // [MODIFIED] เพิ่มการบันทึก Log เมื่อสร้างใหม่
        if (matModal.value.mode === 'add') {
             // ใช้ select() เพื่อขอ ID กลับมาบันทึก Log
             res = await _supabase.from('materials').insert(payload).select().single();
             if(!res.error && res.data) {
                await _supabase.from('material_logs').insert({
                    material_id: res.data.id, 
                    action_type: 'CREATE', 
                    qty_change: parseFloat(d.remaining_qty || 0),
                    current_qty_snapshot: parseFloat(d.remaining_qty || 0),
                    note: 'สร้างรายการวัสดุใหม่', 
                    action_by: userProfile.value.display_name || userProfile.value.email, 
                    action_date: new Date().toISOString()
                });
             }
        } else {
             res = await _supabase.from('materials').update(payload).eq('id', d.id);
        }

        if (res.error) showToast(res.error.message, 'error');
        else {
            showToast('บันทึกเรียบร้อย');
            matModal.value.isOpen = false;
            fetchMaterials();
            fetchLogs(); // Refresh logs ด้วย
        }
    };

    const deleteMaterial = (id) => {
        if (typeof confirmAction !== 'function') return;
        confirmAction('ต้องการลบรายการนี้ใช่ไหม?', async () => {
            const { error } = await _supabase.from('materials').update({ is_deleted: true }).eq('id', id);
            
            if (error) showToast(error.message, 'error');
            else { 
                // [MODIFIED] บันทึก Log เมื่อลบ
                await _supabase.from('material_logs').insert({
                    material_id: id, 
                    action_type: 'DELETE', 
                    qty_change: 0,
                    current_qty_snapshot: 0,
                    note: 'ลบรายการ (Soft Delete)', 
                    action_by: userProfile.value.display_name || userProfile.value.email, 
                    action_date: new Date().toISOString()
                });

                showToast('ลบเรียบร้อย'); 
                fetchMaterials();
                fetchLogs();
            }
        });
    };

    const openStockAction = (type, item) => {
        stockActionModal.value = {
            isOpen: true, type: type, material: item,
            data: { qty: 0, length: 0, date: new Date().toISOString().split('T')[0], user: userProfile.value.display_name || userProfile.value.email, note: '' }
        };
    };

    const submitStockAction = async () => {
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

        const { error: mError } = await _supabase.from('materials').update({ remaining_qty: newBalance, total_in: newTotalIn, total_out: newTotalOut }).eq('id', material.id);
        if (mError) return showToast(mError.message, 'error');

        await _supabase.from('material_logs').insert({
            material_id: material.id, action_type: type, qty_change: finalQtyChange,
            width_used: material.type === 'roll' ? material.width : null,
            length_used: material.type === 'roll' ? inputLength : null,
            current_qty_snapshot: newBalance, note: noteText, action_by: data.user, action_date: data.date
        });

        showToast('บันทึกเรียบร้อย', 'success');
        stockActionModal.value.isOpen = false;
        fetchMaterials();
    };

    return {
        materials, materialLogs, materialCategories, materialTypes,
        invSearch, invCategoryFilter, invMonthFilter, 
        invLogPage, logsPerPage,
        matModal, stockActionModal,
        sortedMaterials, filteredLogs, totalLogPages, paginatedLogs,
        fetchMaterials, fetchLogs, changeLogPage, exportLogsCSV,
        openMatModal, saveMaterial, deleteMaterial, openStockAction, submitStockAction
    };
}