export interface TieredPricingConfig {
  tier1: number; // 1 frame = 45.000đ
  tier2: number; // 2 frame = 85.000đ
  tier3: number; // 3 frame = 120.000đ
  tier4: number; // 4 frame = 160.000đ
  tier5Plus: number; // từ 5 frame = 38.000đ/frame
}

export interface BankConfig {
  bankId: string; // vd: MB, VCB, TCB, VPB...
  bankName: string;
  accountNumber: string;
  accountHolder: string;
}

export interface BillingSettings {
  pricing: TieredPricingConfig;
  bank: BankConfig;
}

export type PaymentMethod = 'cash' | 'transfer' | 'free';

export interface OrderTransaction {
  id: string; // VD: ORD-20261031-143000
  createdAt: number; // timestamp
  dateStr: string; // YYYY-MM-DD
  timeStr: string; // HH:mm:ss
  sessionName?: string;
  frameId?: string;
  frameName: string;
  totalShots: number;
  copies: number; // Số lượng frame in
  totalAmount: number; // Tổng tiền thực thu (VNĐ)
  originalAmount: number; // Giá gốc trước giảm (VNĐ)
  discount: number; // Tiết kiệm (VNĐ)
  paymentMethod: PaymentMethod;
  note?: string;
}

export interface FramePrintStat {
  frameName: string;
  ordersCount: number; // Số lượt chọn chụp frame này
  framesCount: number; // Tổng số bản in của frame này
  revenue: number; // Tổng doanh thu từ frame này (VNĐ)
  percent: number; // Tỷ trọng phần trăm (%)
}

export interface ReconciliationSummary {
  totalOrders: number;
  totalRevenue: number;
  cashRevenue: number;
  cashOrdersCount: number;
  transferRevenue: number;
  transferOrdersCount: number;
  freeOrdersCount: number;
  totalFramesPrinted: number;
  estimatedA4Sheets: number;
  frameStats: FramePrintStat[]; // Thống kê chi tiết số lượng in của từng frame
}
