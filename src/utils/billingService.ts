import { BillingSettings, OrderTransaction, ReconciliationSummary, TieredPricingConfig, BankConfig, PaymentMethod } from '../types/billing';
import { syncDB } from './frameRenderer';

export const DEFAULT_PRICING: TieredPricingConfig = {
  tier1: 45000,
  tier2: 85000,
  tier3: 120000,
  tier4: 160000,
  tier5Plus: 38000,
};

export const DEFAULT_BANK: BankConfig = {
  bankId: 'MB',
  bankName: 'MBBank (Ngân hàng Quân Đội)',
  accountNumber: '8888888888',
  accountHolder: 'CGBOOTH',
};

export const POPULAR_BANKS = [
  { id: 'MB', name: 'MBBank (Quân Đội)' },
  { id: 'VCB', name: 'Vietcombank' },
  { id: 'TCB', name: 'Techcombank' },
  { id: 'ACB', name: 'ACB' },
  { id: 'VPB', name: 'VPBank' },
  { id: 'BIDV', name: 'BIDV' },
  { id: 'CTG', name: 'VietinBank' },
  { id: 'TPB', name: 'TPBank' },
  { id: 'STB', name: 'Sacombank' },
  { id: 'VIB', name: 'VIB' },
  { id: 'MSB', name: 'MSB' },
];

/**
 * Tính toán đơn giá bậc thang chuẩn xác theo bảng giá:
 * 1 frame: 45.000đ
 * 2 frame: 85.000đ (Bình quân 42.500đ, tiết kiệm 5.000đ / 5.6%)
 * 3 frame: 120.000đ (Bình quân 40.000đ, tiết kiệm 15.000đ / 11.1%)
 * 4 frame: 160.000đ (Bình quân 40.000đ, tiết kiệm 20.000đ / 11.1%)
 * Từ 5 frame trở lên: 38.000đ × số frame (tiết kiệm 15.6%)
 */
export function calculateTieredPrice(copies: number, pricing: TieredPricingConfig = DEFAULT_PRICING) {
  const count = Math.max(1, copies);
  let total = 0;
  let avg = 0;
  let formula = '';

  if (count === 1) {
    total = pricing.tier1;
    avg = pricing.tier1;
    formula = 'Mốc 1 frame cố định';
  } else if (count === 2) {
    total = pricing.tier2;
    avg = Math.round(pricing.tier2 / 2);
    formula = 'Mốc 2 frame (-5,6%)';
  } else if (count === 3) {
    total = pricing.tier3;
    avg = Math.round(pricing.tier3 / 3);
    formula = 'Mốc 3 frame (-11,1%)';
  } else if (count === 4) {
    total = pricing.tier4;
    avg = Math.round(pricing.tier4 / 4);
    formula = 'Mốc 4 frame (-11,1%)';
  } else {
    total = count * pricing.tier5Plus;
    avg = pricing.tier5Plus;
    formula = `${count} frame × ${pricing.tier5Plus.toLocaleString('vi-VN')}đ (-15,6%)`;
  }

  const original = count * pricing.tier1;
  const discount = Math.max(0, original - total);
  const discountPercent = original > 0 ? Math.round((discount / original) * 1000) / 10 : 0;

  return {
    count,
    total,
    original,
    discount,
    discountPercent,
    averagePerFrame: avg,
    formula,
  };
}

/**
 * Tạo URL mã VietQR theo chuẩn quốc gia (hoàn toàn miễn phí, quét được bằng tất cả App Ngân Hàng & Momo)
 */
export function getVietQrUrl(bankId: string, accountNo: string, amount: number, memo: string, accountHolder?: string): string {
  const cleanBank = bankId.trim();
  const cleanAcc = accountNo.trim();
  if (!cleanBank || !cleanAcc) return '';
  const safeAmount = Math.max(0, Math.round(amount));
  const encodedMemo = encodeURIComponent(memo || 'CGBOOTH');
  const encodedName = accountHolder ? `&accountName=${encodeURIComponent(accountHolder)}` : '';
  return `https://img.vietqr.io/image/${cleanBank}-${cleanAcc}-compact2.png?amount=${safeAmount}&addInfo=${encodedMemo}${encodedName}`;
}

export const billingService = {
  // Lấy cài đặt đơn giá & ngân hàng
  async getSettings(): Promise<BillingSettings> {
    try {
      const saved = await syncDB.get('billing_settings');
      if (saved && saved.pricing) {
        return {
          pricing: { ...DEFAULT_PRICING, ...saved.pricing },
          bank: { ...DEFAULT_BANK, ...(saved.bank || {}) },
        };
      }
    } catch (e) {
      console.warn('[Billing] Lỗi đọc settings từ DB:', e);
    }
    return { pricing: DEFAULT_PRICING, bank: DEFAULT_BANK };
  },

  // Lưu cài đặt đơn giá & ngân hàng
  async saveSettings(settings: BillingSettings): Promise<void> {
    try {
      await syncDB.set('billing_settings', settings);
      if (window.electronAPI?.saveAccountingBackup) {
        const orders = await this.getAllOrders();
        await window.electronAPI.saveAccountingBackup({ settings, orders });
      }
    } catch (e) {
      console.error('[Billing] Lỗi lưu settings:', e);
    }
  },

  // Lấy tất cả giao dịch
  async getAllOrders(): Promise<OrderTransaction[]> {
    try {
      const orders = await syncDB.get('order_transactions');
      if (Array.isArray(orders)) {
        return orders;
      }
      // Fallback từ file backup Electron nếu DB chưa có
      if (window.electronAPI?.getAccountingBackup) {
        const backup = await window.electronAPI.getAccountingBackup();
        if (backup && Array.isArray(backup.orders)) {
          await syncDB.set('order_transactions', backup.orders);
          return backup.orders;
        }
      }
    } catch (e) {
      console.warn('[Billing] Lỗi tải giao dịch:', e);
    }
    return [];
  },

  // Thêm giao dịch mới
  async addOrder(order: Omit<OrderTransaction, 'id' | 'createdAt' | 'dateStr' | 'timeStr'>): Promise<OrderTransaction> {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const timeStr = now.toTimeString().split(' ')[0]; // HH:mm:ss
    const id = `ORD-${dateStr.replace(/-/g, '')}-${timeStr.replace(/:/g, '')}`;

    const newOrder: OrderTransaction = {
      ...order,
      id,
      createdAt: now.getTime(),
      dateStr,
      timeStr,
    };

    const currentOrders = await this.getAllOrders();
    const updated = [newOrder, ...currentOrders];

    await syncDB.set('order_transactions', updated);
    if (window.electronAPI?.saveAccountingBackup) {
      const settings = await this.getSettings();
      await window.electronAPI.saveAccountingBackup({ settings, orders: updated });
    }

    return newOrder;
  },

  // Cập nhật phương thức hoặc thông tin đơn hàng
  async updateOrder(id: string, updates: Partial<OrderTransaction>): Promise<void> {
    const currentOrders = await this.getAllOrders();
    const updated = currentOrders.map(o => (o.id === id ? { ...o, ...updates } : o));
    await syncDB.set('order_transactions', updated);
    if (window.electronAPI?.saveAccountingBackup) {
      const settings = await this.getSettings();
      await window.electronAPI.saveAccountingBackup({ settings, orders: updated });
    }
  },

  // Xóa đơn hàng (dùng khi chụp thử, hủy, chụp hỏng)
  async deleteOrder(id: string): Promise<void> {
    const currentOrders = await this.getAllOrders();
    const updated = currentOrders.filter(o => o.id !== id);
    await syncDB.set('order_transactions', updated);
    if (window.electronAPI?.saveAccountingBackup) {
      const settings = await this.getSettings();
      await window.electronAPI.saveAccountingBackup({ settings, orders: updated });
    }
  },

  // Tính toán tóm tắt đối chiếu theo ngày hoặc khoảng thời gian
  calculateSummary(orders: OrderTransaction[], targetDate?: string): ReconciliationSummary {
    const filtered = targetDate 
      ? orders.filter(o => o.dateStr === targetDate) 
      : orders;

    let totalRevenue = 0;
    let cashRevenue = 0;
    let cashOrdersCount = 0;
    let transferRevenue = 0;
    let transferOrdersCount = 0;
    let freeOrdersCount = 0;
    let totalFramesPrinted = 0;

    const frameMap: { [name: string]: { ordersCount: number; framesCount: number; revenue: number } } = {};

    for (const ord of filtered) {
      const copies = ord.copies || 1;
      totalFramesPrinted += copies;
      const fName = ord.frameName || 'Khung Mặc Định';

      if (!frameMap[fName]) {
        frameMap[fName] = { ordersCount: 0, framesCount: 0, revenue: 0 };
      }
      frameMap[fName].ordersCount += 1;
      frameMap[fName].framesCount += copies;
      frameMap[fName].revenue += (ord.paymentMethod === 'free' ? 0 : (ord.totalAmount || 0));

      if (ord.paymentMethod === 'free') {
        freeOrdersCount++;
      } else if (ord.paymentMethod === 'cash') {
        cashRevenue += ord.totalAmount || 0;
        cashOrdersCount++;
        totalRevenue += ord.totalAmount || 0;
      } else if (ord.paymentMethod === 'transfer') {
        transferRevenue += ord.totalAmount || 0;
        transferOrdersCount++;
        totalRevenue += ord.totalAmount || 0;
      }
    }

    const frameStats = Object.keys(frameMap).map(name => {
      const item = frameMap[name];
      const percent = totalFramesPrinted > 0 ? Math.round((item.framesCount / totalFramesPrinted) * 1000) / 10 : 0;
      return {
        frameName: name,
        ordersCount: item.ordersCount,
        framesCount: item.framesCount,
        revenue: item.revenue,
        percent,
      };
    }).sort((a, b) => b.framesCount - a.framesCount);

    return {
      totalOrders: filtered.length,
      totalRevenue,
      cashRevenue,
      cashOrdersCount,
      transferRevenue,
      transferOrdersCount,
      freeOrdersCount,
      totalFramesPrinted,
      estimatedA4Sheets: Math.ceil(totalFramesPrinted / 4),
      frameStats,
    };
  },

  // Xuất file CSV báo cáo mở bằng Excel không lỗi font tiếng Việt (UTF-8 BOM)
  exportToCsv(orders: OrderTransaction[], filterDate?: string): void {
    const list = filterDate ? orders.filter(o => o.dateStr === filterDate) : orders;

    const headers = [
      'Mã Đơn Hàng',
      'Ngày',
      'Giờ',
      'Tên Frame',
      'Số Frame In',
      'Hình Thức Thanh Toán',
      'Giá Gốc (VNĐ)',
      'Tiết Kiệm (VNĐ)',
      'Thành Tiền (VNĐ)',
      'Ghi Chú',
    ];

    const rows = list.map(o => [
      `"${o.id}"`,
      `"${o.dateStr}"`,
      `"${o.timeStr}"`,
      `"${(o.frameName || 'Mặc định').replace(/"/g, '""')}"`,
      o.copies,
      o.paymentMethod === 'cash' ? 'Tiền mặt' : o.paymentMethod === 'transfer' ? 'Chuyển khoản' : 'Miễn phí',
      o.originalAmount || o.totalAmount,
      o.discount || 0,
      o.totalAmount,
      `"${(o.note || '').replace(/"/g, '""')}"`,
    ]);

    const summary = this.calculateSummary(list);
    const summaryRows = [
      [],
      ['--- TỔNG HỢP ĐỐI CHIẾU SỔ SÁCH ---'],
      ['Tổng số lượt chụp:', summary.totalOrders],
      ['Tổng số frame in:', summary.totalFramesPrinted],
      ['Ước tính tiêu hao A4:', `${summary.estimatedA4Sheets} tờ`],
      ['TIỀN MẶT TRONG KÉT:', `${summary.cashRevenue.toLocaleString('vi-VN')} đ (${summary.cashOrdersCount} đơn)`],
      ['CHUYỂN KHOẢN SAO KÊ:', `${summary.transferRevenue.toLocaleString('vi-VN')} đ (${summary.transferOrdersCount} đơn)`],
      ['TỔNG DOANH THU:', `${summary.totalRevenue.toLocaleString('vi-VN')} đ`],
      [],
      ['--- THỐNG KÊ SỐ LƯỢNG IN THEO TỪNG FRAME ---'],
      ['Tên Frame', 'Số Lượt Chụp', 'Tổng Bản In (Frame)', 'Tỷ Trọng (%)', 'Doanh Thu (VNĐ)'],
      ...summary.frameStats.map(f => [
        `"${f.frameName.replace(/"/g, '""')}"`,
        f.ordersCount,
        f.framesCount,
        `${f.percent}%`,
        f.revenue,
      ]),
    ];

    const csvContent = '\uFEFF' + [
      headers.join(','),
      ...rows.map(r => r.join(',')),
      ...summaryRows.map(r => r.map(c => `"${c}"`).join(',')),
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Bao_Cao_Thu_Chi_${filterDate || 'Toan_Bo'}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};
