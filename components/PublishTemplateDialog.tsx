import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { TemplateType } from '../types';
import { toast } from 'sonner';

interface PublishTemplateDialogProps {
  onClose: () => void;
  tableId: string;
  tableName: string;
}

const PublishTemplateDialog: React.FC<PublishTemplateDialogProps> = ({ onClose, tableId, tableName }) => {
  const [templateTypes, setTemplateTypes] = useState<TemplateType[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string>('');
  const [name, setName] = useState(tableName);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchTypes = async () => {
      try {
        const res = await api.getTemplateTypes();
        if (res.data) {
          setTemplateTypes(res.data);
          if (res.data.length > 0) {
            setSelectedTypeId(res.data[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to fetch template types', err);
        toast.error('获取模版类型失败');
      }
    };
    fetchTypes();
  }, []);

  const handlePublish = async () => {
    if (!selectedTypeId) {
      toast.error('请选择模版类型');
      return;
    }
    setLoading(true);
    try {
      await api.publishTemplate({
        type_id: selectedTypeId,
        table_id: tableId,
        name,
        description: description || null
      });
      toast.success('模版发布成功！');
      onClose();
    } catch (err: any) {
      console.error('Failed to publish template', err);
      toast.error(err.message || '发布失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]">
      <div className="bg-white rounded-xl shadow-xl w-96 p-6">
        <h2 className="text-lg font-bold mb-4">发布模版</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">模版类型</label>
            <select 
              value={selectedTypeId} 
              onChange={(e) => setSelectedTypeId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-2"
            >
              {templateTypes.map(type => (
                <option key={type.id} value={type.id}>{type.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">模版名称</label>
            <input 
              type="text" 
              value={name} 
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">模版描述</label>
            <textarea 
              value={description} 
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-2"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">取消</button>
          <button onClick={handlePublish} disabled={loading} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
            {loading ? '发布中...' : '发布'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PublishTemplateDialog;
