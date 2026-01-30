import type { JobOrder, ProviderInfo } from './types';
import { supabase } from './supabase';

// Generate printable HTML and open print dialog (uses system fonts like Tahoma)
export const generateJobPdf = async (job: JobOrder) => {
    // 1. Fetch Provider Info
    const { data: provider } = await supabase.from('provider_info').select('*').single();
    
    const prov: ProviderInfo = provider || {
        id: 'default',
        org_name: 'Printing Shop',
        address: '-',
        phone: '-',
        tax_id: '-'
    };

    // 2. Build items table rows
    const itemRows = job.items.map(item => {
        const serviceName = typeof item.service === 'string' 
            ? item.service 
            : (item.service.service_name || item.customName || '-');
        return `
            <tr>
                <td style="padding:8px;border-bottom:1px solid #ddd;">${serviceName}</td>
                <td style="padding:8px;border-bottom:1px solid #ddd;text-align:center;">${item.w} x ${item.h} ${item.unit}</td>
                <td style="padding:8px;border-bottom:1px solid #ddd;text-align:center;">${item.qty}</td>
                <td style="padding:8px;border-bottom:1px solid #ddd;text-align:right;">${item.price.toLocaleString()}</td>
                <td style="padding:8px;border-bottom:1px solid #ddd;text-align:right;">${item.total.toLocaleString()}</td>
            </tr>
        `;
    }).join('');

    // 3. Build HTML
    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>ใบสั่งงาน ${job.job_id}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Tahoma', 'Segoe UI', sans-serif; font-size: 14px; padding: 20px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px; }
        .logo { max-height: 60px; }
        .company { text-align: right; }
        .company h1 { font-size: 18px; margin-bottom: 5px; }
        .company p { font-size: 11px; color: #555; }
        hr { border: none; border-top: 1px solid #000; margin: 15px 0; }
        .title { text-align: center; font-size: 20px; font-weight: bold; margin: 20px 0; }
        .info { display: flex; justify-content: space-between; margin-bottom: 20px; }
        .info div { width: 48%; }
        .info p { margin: 3px 0; }
        .info strong { font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th { background: #f0f0f0; padding: 10px 8px; text-align: left; border-bottom: 2px solid #333; }
        .total-row td { font-weight: bold; border-top: 2px solid #333; }
        .signatures { display: flex; justify-content: space-around; margin-top: 50px; }
        .sig-box { text-align: center; }
        .sig-line { width: 200px; border-bottom: 1px solid #000; margin-bottom: 5px; height: 40px; }
        @media print {
            body { padding: 0; }
            @page { margin: 15mm; }
        }
    </style>
</head>
<body>
    <div class="header">
        <img src="${prov.logo_url || '/crs-logo.svg'}" class="logo" alt="Logo" onerror="this.style.display='none'">
        <div class="company">
            <h1>${prov.org_name}</h1>
            <p>${prov.address}</p>
            <p>โทร: ${prov.phone} | เลขภาษี: ${prov.tax_id}</p>
        </div>
    </div>
    <hr>
    <div class="title">ใบสั่งงาน / ใบส่งของ</div>
    <div class="info">
        <div>
            <p><strong>ลูกค้า:</strong> ${job.customer_name}</p>
            <p><strong>ที่อยู่/สาขา:</strong> ${job.branch || '-'}</p>
            <p><strong>ชื่องาน:</strong> ${job.event_name || '-'}</p>
        </div>
        <div style="text-align:right;">
            <p><strong>เลขที่:</strong> ${job.job_id}</p>
            <p><strong>วันที่:</strong> ${new Date(job.created_at || Date.now()).toLocaleDateString('th-TH')}</p>
            <p><strong>ผู้ทำรายการ:</strong> ${job.created_by}</p>
        </div>
    </div>
    <table>
        <thead>
            <tr>
                <th>รายการ</th>
                <th style="text-align:center;">ขนาด</th>
                <th style="text-align:center;">จำนวน</th>
                <th style="text-align:right;">ราคา/หน่วย</th>
                <th style="text-align:right;">รวม</th>
            </tr>
        </thead>
        <tbody>
            ${itemRows}
            <tr class="total-row">
                <td colspan="4" style="padding:10px 8px;text-align:right;">รวมสุทธิ</td>
                <td style="padding:10px 8px;text-align:right;">${job.total_price.toLocaleString()} บาท</td>
            </tr>
        </tbody>
    </table>
    <div class="signatures">
        <div class="sig-box">
            <div class="sig-line"></div>
            <p>ผู้รับสินค้า</p>
            <p style="font-size:11px;margin-top:5px;">วันที่: ____/____/____</p>
        </div>
        <div class="sig-box">
            <div class="sig-line"></div>
            <p>ผู้ส่งสินค้า</p>
            <p style="font-size:11px;margin-top:5px;">วันที่: ____/____/____</p>
        </div>
    </div>
</body>
</html>
    `;

    // 4. Open in new window and print
    const printWindow = window.open('', '_blank');
    if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.onload = () => {
            printWindow.print();
        };
    } else {
        alert('กรุณาอนุญาต Popup เพื่อพิมพ์เอกสาร');
    }
};
