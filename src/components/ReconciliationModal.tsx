import React, { useState, useEffect } from 'react';
import { X, Download, Settings, Trash2, Calendar, DollarSign, Wallet, CreditCard, Printer, CheckCircle2, RefreshCw } from 'lucide-react';
import { OrderTransaction, BillingSettings, PaymentMethod } from '../types/billing';
import { billingService, POPULAR_BANKS, DEFAULT_PRICING, DEFAULT_BANK } from '../utils/billingService';

interface ReconciliationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOrderChanged?: () => void;
}

export const ReconciliationModal: React.FC<ReconciliationModalProps> = ({
  isOpen,
  onClose,
  onOrderChanged,
}) => {
  const [orders, setOrders] = useState<OrderTransaction[]>([]);
  const [settings, setSettings] = useState<BillingSettings>({ pricing: DEFAULT_PRICING, bank: DEFAULT_BANK });
  const [selectedFilter, setSelectedFilter] = useState<string>('today');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingSettings, setEditingSettings] = useState<BillingSettings>({ pricing: DEFAULT_PRICING, bank: DEFAULT_BANK });

  const todayStr = new Date().toISOString().split('T')[0];
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = yesterdayDate.toISOString().split('T')[0];

  const loadData = async () => {
    const loadedOrders = await billingService.getAllOrders();
    const loadedSettings = await billingService.getSettings();
    setOrders(loadedOrders);
    setSettings(loadedSettings);
    setEditingSettings(loadedSettings);
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Lọc đơn hàng theo mốc thời gian
  let filteredOrders = orders;
  let activeDateLabel = 'Tất cả lịch sử';
  let exportDateArg: string | undefined = undefined;

  if (selectedFilter === 'today') {
    filteredOrders = orders.filter(o => o.dateStr === todayStr);
    activeDateLabel = `Hôm nay (${todayStr})`;
    exportDateArg = todayStr;
  } else if (selectedFilter === 'yesterday') {
    filteredOrders = orders.filter(o => o.dateStr === yesterdayStr);
    activeDateLabel = `Hôm qua (${yesterdayStr})`;
    exportDateArg = yesterdayStr;
  } else if (selectedFilter === '7days') {
    const d7 = new Date();
    d7.setDate(d7.getDate() - 7);
    const d7Str = d7.toISOString().split('T')[0];
    filteredOrders = orders.filter(o => o.dateStr >= d7Str);
    activeDateLabel = '7 ngày qua';
  }

  const summary = billingService.calculateSummary(filteredOrders);

  const handleUpdatePaymentMethod = async (orderId: string, newMethod: PaymentMethod) => {
    const ord = orders.find(o => o.id === orderId);
    if (!ord) return;

    let newTotal = ord.totalAmount;
    if (newMethod === 'free') {
      newTotal = 0;
    } else if (ord.paymentMethod === 'free') {
      // Khôi phục lại giá gốc nếu chuyển từ free sang có phí
      newTotal = ord.originalAmount || 45000;
    }

    await billingService.updateOrder(orderId, {
      paymentMethod: newMethod,
      totalAmount: newTotal,
    });
    await loadData();
    onOrderChanged?.();
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (confirm('Bạn có chắc muốn xóa bản ghi lượt chụp này? (Thường dùng cho ảnh chụp thử hoặc hỏng)')) {
      await billingService.deleteOrder(orderId);
      await loadData();
      onOrderChanged?.();
    }
  };

  const handleSaveSettings = async () => {
    await billingService.saveSettings(editingSettings);
    setSettings(editingSettings);
    setIsSettingsOpen(false);
    alert('Đã lưu thành công cấu hình đơn giá và tài khoản ngân hàng!');
    onOrderChanged?.();
  };

  const handleExportCsv = () => {
    billingService.exportToCsv(orders, exportDateArg);
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
      <div className="liquid-glass border border-cyan-400/30 rounded-3xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col shadow-[0_25px_60px_rgba(0,0,0,0.8)]">
        
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-6 border-b border-white/10 shrink-0 bg-white/[0.02]">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-xl shadow-[0_0_15px_rgba(6,182,212,0.3)] text-cyan-300">
              📊
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-white uppercase tracking-wider">SỔ THU CHI & ĐỐI CHIẾU</h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 uppercase">
                  End-of-Day Audit
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">Đối chiếu két tiền mặt, sao kê ngân hàng và tồn kho giấy in</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Bộ lọc thời gian */}
            <div className="flex items-center bg-black/60 border border-white/15 rounded-xl px-3 py-1.5 text-xs text-slate-300">
              <Calendar className="w-3.5 h-3.5 mr-1.5 text-cyan-400" />
              <select
                value={selectedFilter}
                onChange={e => setSelectedFilter(e.target.value)}
                className="bg-transparent text-white font-bold outline-none cursor-pointer text-xs"
              >
                <option value="today" className="bg-slate-900">Hôm nay ({todayStr})</option>
                <option value="yesterday" className="bg-slate-900">Hôm qua</option>
                <option value="7days" className="bg-slate-900">7 ngày qua</option>
                <option value="all" className="bg-slate-900">Tất cả lịch sử</option>
              </select>
            </div>

            {/* Nút Xuất Excel */}
            <button
              onClick={handleExportCsv}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-400/40 text-xs font-bold uppercase flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
              title="Xuất file báo cáo mở bằng Excel không lỗi font"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Xuất Excel / CSV</span>
            </button>

            {/* Nút Cài đặt */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="px-3.5 py-1.5 rounded-xl liquid-glass-pill hover:border-cyan-400/50 text-cyan-300 hover:text-white text-xs font-bold uppercase flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
              title="Cài đặt đơn giá bậc thang & số tài khoản ngân hàng"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Đơn Giá & Bank</span>
            </button>

            {/* Nút Đóng */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl liquid-glass-pill text-slate-400 hover:text-white hover:border-white/30 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Nội dung chính: Cuộn được */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 custom-scrollbar">

          {/* 4 Thẻ KPI Đối Chiếu Nổi Bật */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* KPI 1: Tổng Doanh Thu */}
            <div className="p-5 rounded-2xl liquid-glass border border-cyan-400/30 flex flex-col justify-between shadow-[0_0_20px_rgba(6,182,212,0.15)] relative overflow-hidden">
              <div className="flex justify-between items-start">
                <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-300">TỔNG DOANH THU</span>
                <span className="text-xl">🏆</span>
              </div>
              <div className="mt-3">
                <div className="text-3xl font-black text-white text-glow-cyan">
                  {summary.totalRevenue.toLocaleString('vi-VN')} <span className="text-sm font-bold text-cyan-300">đ</span>
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Đã hoàn thành <strong>{summary.totalOrders} lượt chụp</strong>
                </div>
              </div>
            </div>

            {/* KPI 2: Tiền Mặt trong Két */}
            <div className="p-5 rounded-2xl liquid-glass border border-emerald-400/30 flex flex-col justify-between shadow-[0_0_20px_rgba(16,185,129,0.15)] relative overflow-hidden">
              <div className="flex justify-between items-start">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">TIỀN MẶT (TRONG KÉT)</span>
                <span className="text-xl">💵</span>
              </div>
              <div className="mt-3">
                <div className="text-3xl font-black text-emerald-300">
                  {summary.cashRevenue.toLocaleString('vi-VN')} <span className="text-sm font-bold">đ</span>
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Kiểm đếm khớp <strong>{summary.cashOrdersCount} đơn tiền mặt</strong>
                </div>
              </div>
            </div>

            {/* KPI 3: Tiền Chuyển Khoản */}
            <div className="p-5 rounded-2xl liquid-glass border border-blue-400/30 flex flex-col justify-between shadow-[0_0_20px_rgba(59,130,246,0.15)] relative overflow-hidden">
              <div className="flex justify-between items-start">
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-300">CHUYỂN KHOẢN (NGÂN HÀNG)</span>
                <span className="text-xl">📲</span>
              </div>
              <div className="mt-3">
                <div className="text-3xl font-black text-blue-300">
                  {summary.transferRevenue.toLocaleString('vi-VN')} <span className="text-sm font-bold">đ</span>
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Khớp sao kê <strong>{summary.transferOrdersCount} đơn VietQR</strong>
                </div>
              </div>
            </div>

            {/* KPI 4: Bản in tiêu hao */}
            <div className="p-5 rounded-2xl liquid-glass border border-amber-400/30 flex flex-col justify-between shadow-[0_0_20px_rgba(245,158,11,0.15)] relative overflow-hidden">
              <div className="flex justify-between items-start">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300">TỔNG FRAME ĐÃ IN</span>
                <span className="text-xl">🖨️</span>
              </div>
              <div className="mt-3">
                <div className="text-3xl font-black text-amber-300">
                  {summary.totalFramesPrinted} <span className="text-sm font-bold">frame</span>
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Ước tính tiêu hao <strong>~{summary.estimatedA4Sheets} tờ A4</strong> giấy in
                </div>
              </div>
            </div>

          </div>

          {/* Thống Kê Số Lượng In Của Từng Frame */}
          {summary.frameStats.length > 0 && (
            <div className="p-5 rounded-2xl liquid-glass border border-cyan-400/20 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <span>🖼️</span> Thống Kê Số Lượng Bản In Từng Frame ({activeDateLabel})
                </h3>
                <span className="text-xs text-cyan-300 font-mono">
                  {summary.frameStats.length} loại frame đã chụp
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-1">
                {summary.frameStats.map((f, idx) => (
                  <div key={idx} className="p-3.5 rounded-xl bg-black/40 border border-white/10 flex flex-col justify-between gap-2 hover:border-cyan-400/40 transition-colors">
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-xs font-bold text-white truncate max-w-[200px]" title={f.frameName}>
                        {f.frameName}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 shrink-0">
                        {f.percent}%
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between mt-1">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-slate-400 uppercase font-mono">Số Frame In</span>
                        <span className="text-xl font-black text-amber-300 font-mono">
                          {f.framesCount} <span className="text-xs font-normal text-slate-300">bản</span>
                        </span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] text-slate-400 uppercase font-mono">{f.ordersCount} lượt chụp</span>
                        <span className="text-sm font-bold text-cyan-300 font-mono">
                          {f.revenue.toLocaleString('vi-VN')} đ
                        </span>
                      </div>
                    </div>

                    {/* Thanh tỷ trọng */}
                    <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden mt-1">
                      <div 
                        className="bg-gradient-to-r from-cyan-400 to-indigo-400 h-full rounded-full transition-all duration-500" 
                        style={{ width: `${Math.min(100, Math.max(5, f.percent))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bảng Kê Chi Tiết Giao Dịch */}
          <div className="p-5 rounded-2xl liquid-glass border border-white/10 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <span>📋</span> Danh Sách Chi Tiết Từng Lượt Chụp ({activeDateLabel})
              </h3>
              <span className="text-xs text-slate-400 font-mono">
                Tổng cộng: {filteredOrders.length} giao dịch
              </span>
            </div>

            {filteredOrders.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-slate-500 gap-2">
                <span className="text-4xl">📭</span>
                <p className="text-xs uppercase font-mono tracking-widest">Chưa có giao dịch nào trong khoảng thời gian này</p>
              </div>
            ) : (
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400 font-mono uppercase text-[10px]">
                      <th className="py-2.5 px-3">Mã Đơn</th>
                      <th className="py-2.5 px-3">Thời Gian</th>
                      <th className="py-2.5 px-3">Khung Chụp</th>
                      <th className="py-2.5 px-3 text-center">Số Frame</th>
                      <th className="py-2.5 px-3">Hình Thức</th>
                      <th className="py-2.5 px-3 text-right">Thành Tiền (VNĐ)</th>
                      <th className="py-2.5 px-3 text-center">Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-medium">
                    {filteredOrders.map(ord => (
                      <tr key={ord.id} className="hover:bg-white/[0.03] transition-colors">
                        <td className="py-2.5 px-3 font-mono text-cyan-300 font-bold">{ord.id}</td>
                        <td className="py-2.5 px-3 text-slate-300 font-mono">{ord.timeStr}</td>
                        <td className="py-2.5 px-3 text-white max-w-[160px] truncate" title={ord.frameName}>
                          {ord.frameName || 'Mặc định'}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="px-2 py-0.5 rounded bg-white/10 font-mono font-bold text-cyan-200">
                            {ord.copies} frame
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <select
                            value={ord.paymentMethod}
                            onChange={e => handleUpdatePaymentMethod(ord.id, e.target.value as PaymentMethod)}
                            className={`px-2 py-1 rounded-lg text-xs font-bold outline-none cursor-pointer border ${
                              ord.paymentMethod === 'cash'
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                                : ord.paymentMethod === 'transfer'
                                ? 'bg-blue-500/20 text-blue-300 border-blue-400/40'
                                : 'bg-slate-500/20 text-slate-400 border-slate-400/30'
                            }`}
                          >
                            <option value="cash" className="bg-slate-900 text-emerald-300">💵 Tiền mặt</option>
                            <option value="transfer" className="bg-slate-900 text-blue-300">💳 Chuyển khoản</option>
                            <option value="free" className="bg-slate-900 text-slate-400">🏷️ Miễn phí / Test</option>
                          </select>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-white text-sm">
                          {ord.totalAmount.toLocaleString('vi-VN')} đ
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            onClick={() => handleDeleteOrder(ord.id)}
                            className="p-1 hover:text-red-400 text-slate-500 transition-colors cursor-pointer"
                            title="Xóa đơn (chụp thử/hỏng)"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>

      </div>

      {/* Settings Sub-Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/80 p-4">
          <div className="liquid-glass border border-cyan-400/40 rounded-3xl w-full max-w-lg p-6 shadow-2xl flex flex-col gap-5 animate-zoomIn">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <h3 className="text-base font-black text-cyan-300 uppercase tracking-wider flex items-center gap-2">
                <Settings className="w-4 h-4 text-cyan-400" />
                Cài Đặt Đơn Giá & VietQR
              </h3>
              <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-4 text-xs">
              <div>
                <span className="font-bold text-white uppercase tracking-wider">Bảng Giá Bậc Thang (VNĐ):</span>
                <p className="text-slate-400 text-[11px] mt-0.5">Giá tính theo số lượng frame mua cùng lần</p>
                <div className="grid grid-cols-2 gap-2.5 mt-2">
                  <div>
                    <label className="text-slate-300 font-mono">1 frame:</label>
                    <input
                      type="number"
                      step="1000"
                      value={editingSettings.pricing.tier1}
                      onChange={e => setEditingSettings({
                        ...editingSettings,
                        pricing: { ...editingSettings.pricing, tier1: Number(e.target.value) }
                      })}
                      className="w-full bg-black/60 border border-white/15 rounded-xl px-3 py-1.5 text-white font-mono font-bold mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-slate-300 font-mono">2 frame:</label>
                    <input
                      type="number"
                      step="1000"
                      value={editingSettings.pricing.tier2}
                      onChange={e => setEditingSettings({
                        ...editingSettings,
                        pricing: { ...editingSettings.pricing, tier2: Number(e.target.value) }
                      })}
                      className="w-full bg-black/60 border border-white/15 rounded-xl px-3 py-1.5 text-white font-mono font-bold mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-slate-300 font-mono">3 frame:</label>
                    <input
                      type="number"
                      step="1000"
                      value={editingSettings.pricing.tier3}
                      onChange={e => setEditingSettings({
                        ...editingSettings,
                        pricing: { ...editingSettings.pricing, tier3: Number(e.target.value) }
                      })}
                      className="w-full bg-black/60 border border-white/15 rounded-xl px-3 py-1.5 text-white font-mono font-bold mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-slate-300 font-mono">4 frame:</label>
                    <input
                      type="number"
                      step="1000"
                      value={editingSettings.pricing.tier4}
                      onChange={e => setEditingSettings({
                        ...editingSettings,
                        pricing: { ...editingSettings.pricing, tier4: Number(e.target.value) }
                      })}
                      className="w-full bg-black/60 border border-white/15 rounded-xl px-3 py-1.5 text-white font-mono font-bold mt-1"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-slate-300 font-mono">Từ 5 frame trở lên (Giá mỗi frame):</label>
                    <input
                      type="number"
                      step="1000"
                      value={editingSettings.pricing.tier5Plus}
                      onChange={e => setEditingSettings({
                        ...editingSettings,
                        pricing: { ...editingSettings.pricing, tier5Plus: Number(e.target.value) }
                      })}
                      className="w-full bg-black/60 border border-white/15 rounded-xl px-3 py-1.5 text-white font-mono font-bold mt-1"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-white/10 pt-3">
                <span className="font-bold text-white uppercase tracking-wider">Thông Tin Nhận Chuyển Khoản (VietQR):</span>
                <div className="flex flex-col gap-2 mt-2">
                  <div>
                    <label className="text-slate-300">Ngân Hàng:</label>
                    <select
                      value={editingSettings.bank.bankId}
                      onChange={e => {
                        const found = POPULAR_BANKS.find(b => b.id === e.target.value);
                        setEditingSettings({
                          ...editingSettings,
                          bank: {
                            ...editingSettings.bank,
                            bankId: e.target.value,
                            bankName: found ? found.name : e.target.value,
                          }
                        });
                      }}
                      className="w-full bg-black/60 border border-white/15 rounded-xl px-3 py-1.5 text-white font-bold mt-1 cursor-pointer"
                    >
                      {POPULAR_BANKS.map(b => (
                        <option key={b.id} value={b.id} className="bg-slate-900 text-white">
                          {b.name} ({b.id})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-300">Số Tài Khoản:</label>
                    <input
                      type="text"
                      value={editingSettings.bank.accountNumber}
                      onChange={e => setEditingSettings({
                        ...editingSettings,
                        bank: { ...editingSettings.bank, accountNumber: e.target.value }
                      })}
                      placeholder="VD: 0988888888"
                      className="w-full bg-black/60 border border-white/15 rounded-xl px-3 py-1.5 text-white font-mono mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-slate-300">Tên Chủ Tài Khoản:</label>
                    <input
                      type="text"
                      value={editingSettings.bank.accountHolder}
                      onChange={e => setEditingSettings({
                        ...editingSettings,
                        bank: { ...editingSettings.bank, accountHolder: e.target.value }
                      })}
                      placeholder="VD: NGUYEN VAN A"
                      className="w-full bg-black/60 border border-white/15 rounded-xl px-3 py-1.5 text-white uppercase mt-1"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2 border-t border-white/10">
              <button
                onClick={() => setEditingSettings({ pricing: DEFAULT_PRICING, bank: DEFAULT_BANK })}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white"
              >
                Mặc Định
              </button>
              <button
                onClick={handleSaveSettings}
                className="liquid-btn-cyber px-5 py-2 rounded-xl text-xs font-bold uppercase cursor-pointer"
              >
                Lưu Cài Đặt
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
