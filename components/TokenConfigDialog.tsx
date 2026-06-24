
import React, { useState, useEffect } from 'react';
import { ICONS } from '../constants';
import { toast } from 'sonner';
import ConfirmDialog from './ConfirmDialog';

interface TokenConfigDialogProps {
  onClose: () => void;
}

const TokenConfigDialog: React.FC<TokenConfigDialogProps> = ({ onClose }) => {
  const [manualToken, setManualToken] = useState('');
  const [savedToken, setSavedToken] = useState('');
  const [socketUrl, setSocketUrl] = useState('http://192.168.1.201:5005');
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  useEffect(() => {
      const current = localStorage.getItem('console_token');
      if (current) setSavedToken(current);

      const savedUrl = localStorage.getItem('socket_server_url');
      if (savedUrl) setSocketUrl(savedUrl);
  }, []);

  const handleSave = () => {
    const tokenToSave = manualToken.trim();
    if (tokenToSave) {
      localStorage.setItem('console_token', tokenToSave);
      setSavedToken(tokenToSave);
    }
    
    const urlToSave = socketUrl.trim();
    if (urlToSave) {
      localStorage.setItem('socket_server_url', urlToSave);
    } else {
      localStorage.removeItem('socket_server_url');
    }
    
    toast.success('协同与鉴权配置已保存');
    onClose();
    // Reload to apply configured tokens to all modules
    window.location.reload(); 
  };

  const handleClear = () => {
      setIsConfirmOpen(true);
  }

  const confirmClear = () => {
      localStorage.removeItem('console_token');
      setSavedToken('');
      setIsConfirmOpen(false);
      toast.success('Token 已清除');
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-[1000] flex items-center justify-center p-4 text-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col">
        
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-white">
           <div>
             <h2 className="text-xl font-bold text-gray-800">实时协同与 API 鉴权配置</h2>
             <p className="text-sm text-gray-500 mt-1">配置 Console API Token 与 WebSocket 同步服务器地址。</p>
           </div>
           <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
             <ICONS.Close className="w-6 h-6"/>
           </button>
         </div>

        <div className="p-6 bg-gray-50">
           {/* Info Banner */}
           <div className="bg-primary-50 border border-primary-100 rounded-lg p-4 mb-6 flex gap-3 text-sm text-primary-800">
              <ICONS.Lock className="w-5 h-5 shrink-0 mt-0.5 text-primary-600"/>
              <div>
                <p className="font-bold mb-1">安全提示</p>
                <p className="opacity-90">Token 及 WebSocket 配置将仅保存在您的本地浏览器中 (localStorage)。</p>
              </div>
           </div>

           {/* Current Token Status */}
           <div className="mb-6">
               <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase">当前鉴权状态</label>
               <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-3">
                   <div className="flex items-center gap-2">
                       <div className={`w-2.5 h-2.5 rounded-full ${savedToken ? 'bg-green-500' : 'bg-red-500'}`}></div>
                       <span className="font-medium text-gray-700">{savedToken ? '已配置 Token' : '未配置 Token (默认 guest)'}</span>
                   </div>
                   {savedToken && (
                       <button onClick={handleClear} className="text-xs text-red-600 hover:underline">清除</button>
                   )}
               </div>
           </div>

           {/* Input Section */}
           <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase">同步服务器地址 (WebSocket URL)</label>
                <input 
                    value={socketUrl}
                    onChange={(e) => setSocketUrl(e.target.value)}
                    placeholder="http://192.168.1.201:5005"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none font-mono text-gray-600 mb-4 transition-shadow"
                />

                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase">输入 Token</label>
                <input 
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                    placeholder={savedToken ? "•••••••••••••••••••••••••••••••• (已保存)" : "eyJhbGciOiJIUzI1NiIsInR5cCI6Ik..."}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none font-mono text-gray-600 placeholder-gray-300 transition-shadow mb-4"
                    onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSave();
                    }}
                />
                
                <div className="flex justify-end gap-3">
                    <button 
                        onClick={onClose} 
                        className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        取消
                    </button>
                    <button 
                        onClick={handleSave} 
                        className="bg-primary-600 text-white px-5 py-2 rounded-lg text-sm font-bold hover:bg-primary-700 shadow-md transition-all active:scale-95"
                    >
                        保存并重载
                    </button>
                </div>
           </div>
        </div>
      </div>

      <ConfirmDialog 
        isOpen={isConfirmOpen}
        title="确认清除"
        message="确定要清除本地保存的 Token 吗？清除后您将无法访问需要鉴权的 API。"
        onConfirm={confirmClear}
        onCancel={() => setIsConfirmOpen(false)}
      />
    </div>
  );
};

export default TokenConfigDialog;
