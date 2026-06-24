import React, { useState, useEffect } from 'react';
import { Table, FieldType, ViewType } from '../types';
import { api } from '../services/api';
import { ICONS } from '../constants';
import { toast } from 'sonner';

interface MetadataDefinition {
  label: string;
  value: string; // The metadata definition ID to pass as metadata_id
  default_value: string;
  candidates: string[];
  required: boolean;
  metadata_type: 'STRING' | 'SELECT' | 'TEXT' | string;
}

interface TableMetadataDialogProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'add' | 'edit';
  table: Table | null;
  onSuccess: (newTableId: string) => void;
}

export const TableMetadataDialog: React.FC<TableMetadataDialogProps> = ({
  isOpen,
  onClose,
  mode,
  table,
  onSuccess,
}) => {
  const [tableName, setTableName] = useState('');
  const [definitions, setDefinitions] = useState<MetadataDefinition[]>([]);
  const [metadataInputs, setMetadataInputs] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingChoices, setIsFetchingChoices] = useState(false);
  const [errorFields, setErrorFields] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isOpen) return;

    // Reset fields
    setTableName(mode === 'edit' && table ? table.name : '新数据表');
    setMetadataInputs({});
    setErrorFields({});
    setIsLoading(false);

    const loadMetadataDefinitions = async () => {
      setIsFetchingChoices(true);
      try {
        // 1. 获取所有的自定义属性定义，从而确定有哪些字段、字段类型、候选值等
        const res = await api.getMetadataChoices('MDTABLE');
        const choices = (res.data || []) as MetadataDefinition[];
        setDefinitions(choices);

        let fetchedTable: Table | null = table;
        
        if (mode === 'edit' && table) {
          try {
            // 从多维表格列表接口中获取最新最全的数据，来获取最新的自定义属性配置回显
            const listRes = await api.getTables();
            const tableList = (listRes.data?.list || listRes.data || (Array.isArray(listRes) ? listRes : [])) as Table[];
            const freshTable = tableList.find((t: any) => t.id === table.id);
            if (freshTable) {
              fetchedTable = freshTable;
              if (freshTable.name) {
                setTableName(freshTable.name);
              }
            }
          } catch (listErr) {
            console.error('获取表格列表回显失败，将使用传入的数据', listErr);
          }
        }

        // 2. 初始化输入项，根据已保存的 metadata_values 进行回显
        const initialInputs: Record<string, string> = {};
        choices.forEach((def) => {
          // 优先从表格数据中读取已经保存的自定义属性值 metadata_values
          const existing = fetchedTable?.metadata_values?.find(
            (mv) => mv.metadata_id === def.value || (mv as any).value === def.value
          );

          if (existing) {
            initialInputs[def.value] = existing.metadata_value;
          } else {
            // 如果未配置过，则回显默认值
            initialInputs[def.value] = def.default_value || '';
          }
        });

        setMetadataInputs(initialInputs);
      } catch (err: any) {
        console.error('加载自定义属性配置失败', err);
        toast.error('获取自定义属性配置失败，请检查网络或重新配置 Token');
      } finally {
        setIsFetchingChoices(false);
      }
    };

    loadMetadataDefinitions();
  }, [isOpen, mode, table]);

  if (!isOpen) return null;

  const handleMetadataChange = (id: string, value: string) => {
    setMetadataInputs((prev) => ({
      ...prev,
      [id]: value,
    }));
    // Clear error for this field
    if (value.trim() !== '') {
      setErrorFields((prev) => ({
        ...prev,
        [id]: false,
      }));
    }
  };

  const handleSave = async () => {
    if (!tableName.trim()) {
      toast.error('表名称不能为空');
      return;
    }

    // Validation
    const newErrors: Record<string, boolean> = {};
    let hasValidationError = false;

    definitions.forEach((def) => {
      if (def.required) {
        const val = metadataInputs[def.value] || '';
        if (!val.trim()) {
          newErrors[def.value] = true;
          hasValidationError = true;
        }
      }
    });

    if (hasValidationError) {
      setErrorFields(newErrors);
      toast.error('请填写所有必填的自定义属性项');
      return;
    }

    setIsLoading(true);

    // Format metadata_values payload
    const metadataValuesPayload: { metadata_id: string; metadata_value: string }[] = Object.entries(metadataInputs)
      .filter(([_, val]) => val !== undefined)
      .map(([id, val]) => ({
        metadata_id: id,
        metadata_value: String(val),
      }));

    try {
      if (mode === 'add') {
        const newTablePayload = {
          name: tableName.trim(),
          columns: [
            { id: 'c1', name: '名称', type: FieldType.TEXT, width: 220, config: {}, sort: 0 },
            {
              id: 'c2',
              name: '状态',
              type: FieldType.SELECT,
              width: 140,
              config: {
                options: ['待处理', '进行中', '已完成'],
                option_colors: { '待处理': 'gray', '进行中': 'blue', '已完成': 'green' },
              },
              sort: 1,
            },
          ],
          views: [{ id: 'v1', name: '表格视图', type: ViewType.GRID, is_default: true, config: {} }],
          metadata_values: metadataValuesPayload,
        };

        const res = await api.createTable(newTablePayload);
        toast.success(`成功创建表格 "${tableName}"`);
        const newTableId = res.data?.id || (res as any).id;
        onSuccess(newTableId);
        onClose();
      } else {
        if (!table) return;
        await api.updateTable(table.id, {
          name: tableName.trim(),
          metadata_values: metadataValuesPayload,
        });
        toast.success(`成功更新表格 "${tableName}" 属性配置`);
        onSuccess(table.id);
        onClose();
      }
    } catch (err: any) {
      console.error('保存表格属性失败', err);
      toast.error(err.message || '保存失败，请确保配置有有效的账户权限');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-[1000] flex items-center justify-center p-4 text-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-white">
          <div>
            <h2 className="text-lg font-bold text-gray-800">
              {mode === 'add' ? '新建数据表' : '编辑数据表属性'}
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              {mode === 'add' ? '设定数据表名称及所需的自定义属性配置。' : '更新数据表信息及对应的自定义属性配置。'}
            </p>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
          >
            <ICONS.Close className="w-5 h-5"/>
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto space-y-5 bg-gray-50/50 flex-1">
          {/* Table Name Section */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
              表格名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              placeholder="请输入表格名称"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-gray-800 transition-all shadow-sm"
              maxLength={50}
            />
          </div>

          {/* Metadata Choices Sections */}
          <div className="border-t border-gray-100 pt-4 space-y-4">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">
              自定义属性配置
            </h3>

            {isFetchingChoices ? (
              <div className="flex flex-col items-center justify-center py-8 text-gray-400 gap-2">
                <svg className="animate-spin h-5 w-5 text-primary-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="text-xs">加载自定义属性选项中...</span>
              </div>
            ) : definitions.length === 0 ? (
              <div className="bg-orange-50/50 border border-orange-100 text-orange-700 text-xs p-3.5 rounded-lg">
                暂未获取到自定义属性定义。您仍然可以正常创建和命名该表格。
              </div>
            ) : (
              <div className="space-y-4">
                {definitions.map((def) => {
                  const currentValue = metadataInputs[def.value] || '';
                  const hasError = errorFields[def.value];

                  return (
                    <div key={def.value} className="space-y-1.5 bg-white p-3.5 rounded-lg border border-gray-200/60 shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                          {def.label}
                          {def.required && <span className="text-red-500">*</span>}
                        </span>
                      </div>

                      {def.metadata_type === 'SELECT' ? (
                        <select
                          value={currentValue}
                          onChange={(e) => handleMetadataChange(def.value, e.target.value)}
                          className={`w-full border rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-gray-700 transition-all ${
                            hasError ? 'border-red-400 focus:ring-red-300' : 'border-gray-200'
                          }`}
                        >
                          <option value="">- 请选择 -</option>
                          {def.candidates?.map((candidate) => (
                            <option key={candidate} value={candidate}>
                              {candidate}
                            </option>
                          ))}
                        </select>
                      ) : def.metadata_type === 'TEXT' ? (
                        <textarea
                          value={currentValue}
                          onChange={(e) => handleMetadataChange(def.value, e.target.value)}
                          placeholder="请输入多行文本..."
                          className={`w-full border rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-gray-700 transition-all ${
                            hasError ? 'border-red-400 focus:ring-red-300' : 'border-gray-200'
                          }`}
                          rows={3}
                        />
                      ) : (
                        <input
                          type="text"
                          value={currentValue}
                          onChange={(e) => handleMetadataChange(def.value, e.target.value)}
                          placeholder="请输入属性值..."
                          className={`w-full border rounded-lg px-3  py-2 text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-gray-700 transition-all ${
                            hasError ? 'border-red-400 focus:ring-red-300' : 'border-gray-200'
                          }`}
                        />
                      )}

                      {hasError && (
                        <p className="text-[10px] text-red-500 font-medium">
                          请填写此必填属性项
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 flex justify-end gap-3 bg-white">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-all disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={isLoading || isFetchingChoices}
            className="bg-primary-600 hover:bg-primary-700 text-white px-5 py-2 rounded-lg text-xs font-semibold shadow-md transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-1.5 h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                正在保存...
              </>
            ) : (
              '确定并保存'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
