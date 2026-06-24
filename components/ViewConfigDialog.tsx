
import React, { useState, useEffect } from 'react';
import { ViewType, ViewMetadata, ApiOption } from '../types';
import { ICONS } from '../constants';
import { api } from '../services/api';

interface ViewConfigDialogProps {
  onClose: () => void;
  onSave: (view: Partial<ViewMetadata>) => void;
}

// Fallback metadata for icons and descriptions, mapped by API value key
const VIEW_ICONS: Record<string, React.ReactNode> = {
  [ViewType.GRID]: <ICONS.Grid />,
  [ViewType.KANBAN]: <ICONS.Kanban />,
  [ViewType.CALENDAR]: <ICONS.Calendar />,
  [ViewType.GALLERY]: <ICONS.Gallery />,
  [ViewType.GANTT]: <ICONS.Gantt />,
  [ViewType.DASHBOARD]: <ICONS.Dashboard />,
  [ViewType.FORM]: <ICONS.Form />,
};

const VIEW_DESCRIPTIONS: Record<string, string> = {
  [ViewType.GRID]: '最基础的行列数据展示',
  [ViewType.KANBAN]: '按状态分组的卡片流程',
  [ViewType.CALENDAR]: '基于日期的月历展示',
  [ViewType.GALLERY]: '强调图片的卡片展示',
  [ViewType.GANTT]: '基于时间轴的项目进度',
  [ViewType.DASHBOARD]: '数据统计与图表概览',
  [ViewType.FORM]: '对外收集数据的表单',
};

const ViewConfigDialog: React.FC<ViewConfigDialogProps> = ({ onClose, onSave }) => {
  const [name, setName] = useState('');
  const [selectedType, setSelectedType] = useState<string>(ViewType.GRID);
  const [viewTypes, setViewTypes] = useState<ApiOption[]>([]);

  useEffect(() => {
    const loadViewTypes = async () => {
        try {
            const res = await api.getViewTypes();
            if (res.data && Array.isArray(res.data)) {
                setViewTypes(res.data);
                // Set default to first one if available
                if (res.data.length > 0) {
                   // Prefer GRID if it exists, otherwise first
                   const gridExists = res.data.some(vt => vt.value === ViewType.GRID);
                   setSelectedType(gridExists ? ViewType.GRID : res.data[0].value);
                }
            }
        } catch (e) {
            console.error("Failed to load view types", e);
            // Fallback hardcoded if API fails
            setViewTypes([
                { label: '表格视图', value: ViewType.GRID },
                { label: '看板视图', value: ViewType.KANBAN },
                { label: '日历视图', value: ViewType.CALENDAR },
                { label: '画册视图', value: ViewType.GALLERY },
                { label: '甘特视图', value: ViewType.GANTT },
                { label: '仪表盘', value: ViewType.DASHBOARD },
            ]);
        }
    };
    loadViewTypes();
  }, []);

  const handleSave = () => {
    const selectedLabel = viewTypes.find(vt => vt.value === selectedType)?.label;
    onSave({
      name: name || selectedLabel || '新视图',
      type: selectedType as ViewType,
      config: {} 
    });
  };

  return (
    <div data-modal-portal="true" className="fixed inset-0 bg-black/40 z-[1000] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200">
        <div className="p-5 border-b border-gray-100 flex justify-between items-center">
           <h2 className="text-xl font-bold text-gray-800">新建视图</h2>
           <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">✕</button>
        </div>

        <div className="p-6 space-y-6">
           <div>
             <label className="block text-sm font-medium text-gray-700 mb-2">视图名称</label>
             <input 
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                placeholder="例如：本月任务、图片墙..."
             />
           </div>

           <div>
             <label className="block text-sm font-medium text-gray-700 mb-3">选择视图类型</label>
             <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
               {viewTypes.map((item) => (
                 <div 
                   key={item.value}
                   onClick={() => setSelectedType(item.value)}
                   className={`
                     cursor-pointer rounded-lg border p-4 transition-all flex flex-col items-center text-center gap-2 hover:shadow-md
                     ${selectedType === item.value 
                        ? 'border-primary-500 bg-primary-50 text-primary-700' 
                        : 'border-gray-200 bg-white text-gray-600 hover:border-primary-300'}
                   `}
                 >
                    <div className={`${selectedType === item.value ? 'text-primary-600' : 'text-gray-400'} scale-125`}>
                      {VIEW_ICONS[item.value] || <ICONS.Grid />}
                    </div>
                    <div className="font-bold text-sm">{item.label}</div>
                    <div className="text-[10px] text-gray-400 leading-tight">{VIEW_DESCRIPTIONS[item.value] || '自定义视图类型'}</div>
                 </div>
               ))}
             </div>
           </div>
        </div>

        <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl flex justify-end gap-3">
           <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg">取消</button>
           <button 
             onClick={handleSave}
             className="px-6 py-2 text-sm font-bold bg-primary-600 text-white rounded-lg hover:bg-primary-700 shadow-md transition-colors"
           >
             创建视图
           </button>
        </div>
      </div>
    </div>
  );
};

export default ViewConfigDialog;
