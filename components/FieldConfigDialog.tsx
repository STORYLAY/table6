
import React, { useState, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { FieldType, Column, Table } from '../types';
import { ICONS, TAG_COLORS, TagColorKey, getTagColor, parseJsonArray } from '../constants';
import { Tooltip } from './Tooltip';
import { generateSmartFormula, generateFieldOptions } from '../geminiService';
import ConfirmDialog from './ConfirmDialog';
import { api } from '../services/api';
import { Select, SelectOption } from './Select';
import { OptionColorPicker } from './CellEditors';

interface FieldConfigDialogProps {
  tableId: string;
  column?: Column;
  allColumns?: Column[]; // 用于公式编辑时提供可用列参考
  allTables?: Table[]; // 用于关联字段选择表
  isVisible?: boolean; // 当前在视图中是否可见
  anchorEl?: HTMLElement | null | { top: number, left: number };
  mode?: 'modal' | 'popover';
  onClose: () => void;
  onSave: (column: Column, isVisible: boolean) => void | Promise<void>;
  onDelete?: (colId: string) => boolean | Promise<boolean>;
}

// Fallback if API fails
const FIELD_TYPE_LABELS_DEFAULT: Record<string, string> = {
  [FieldType.TEXT]: '文本',
  [FieldType.NUMBER]: '数字',
  [FieldType.SELECT]: '单选',
  [FieldType.MULTI_SELECT]: '多选',
  [FieldType.DATE]: '日期',
  [FieldType.TIME]: '时间',
  [FieldType.CHECKBOX]: '复选框',
  [FieldType.FORMULA]: '公式',
  [FieldType.ATTACHMENT]: '附件',
  [FieldType.USER]: '人员',
  [FieldType.DEPARTMENT]: '部门',
  [FieldType.GROUP]: '群组',
  [FieldType.LINK]: '关联引用',
  [FieldType.HYPERLINK]: '超链接',
  [FieldType.LOOKUP]: '引用 (Lookup)',
  [FieldType.SEARCH_REFERENCE]: '查找引用',
};

const NUMBER_FORMATS = [
  { label: '整数 (1)', value: '0' },
  { label: '保留一位小数 (1.0)', value: '0.0' },
  { label: '保留两位小数 (1.00)', value: '0.00' },
  { label: '百分比 (100%)', value: '0%' },
  { label: '货币 (¥1.00)', value: '¥0.00' },
];

const DATE_FORMATS = [
  { label: '年-月-日 (2024-05-20)', value: 'YYYY-MM-DD' },
  { label: '年/月/日 (2024/05/20)', value: 'YYYY/MM/DD' },
  { label: '月/日/年 (05/20/2024)', value: 'MM/DD/YYYY' },
  { label: '时间 (2024-05-20 14:30)', value: 'YYYY-MM-DD HH:mm' },
];

const TIME_FORMATS = [
  { label: '时 (HH)', value: 'HH' },
  { label: '时分 (HH:mm)', value: 'HH:mm' },
  { label: '时分秒 (HH:mm:ss)', value: 'HH:mm:ss' },
];

const UserSelector = ({
    value,
    onChange,
    onClose
}: {
    value: any,
    onChange: (val: any) => void,
    onClose: () => void
}) => {
    const [members, setMembers] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [keyword, setKeyword] = useState('');
    
    // Normalize value to array
    const selectedUsers = useMemo(() => {
        const arr = Array.isArray(value) ? value : (value ? [value] : []);
        return arr.filter(u => u !== null && u !== undefined && u !== '' && u !== '[]');
    }, [value]);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const res = await api.getMembers({ name: keyword });
                setMembers(res.accounts || []);
            } catch(e) { console.error(e); }
            setLoading(false);
        };
        const timer = setTimeout(load, 300);
        return () => clearTimeout(timer);
    }, [keyword]);

    const toggleUser = (user: any) => {
        const exists = selectedUsers.find((u: any) => u.id === user.id);
        let newSel;
        if (exists) {
            newSel = selectedUsers.filter((u: any) => u.id !== user.id);
        } else {
            newSel = [...selectedUsers, { id: user.id, name: user.name, real_name: user.real_name }];
        }
        onChange(newSel);
    };

    return (
        <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-200 shadow-xl rounded-lg z-[120] flex flex-col overflow-hidden">
            <div className="p-2 border-b border-gray-100 flex items-center gap-2">
                <input 
                    className="flex-1 text-xs px-2 py-1 bg-gray-50 border border-gray-200 rounded outline-none focus:border-primary-500"
                    placeholder="搜索成员..."
                    value={keyword}
                    onChange={e => setKeyword(e.target.value)}
                    autoFocus
                />
                <Tooltip content="关闭" className="shrink-0 flex items-center justify-center">
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <ICONS.Close className="w-4 h-4" />
                    </button>
                </Tooltip>
            </div>
            <div className="max-h-48 overflow-y-auto custom-scrollbar">
                {loading ? <div className="p-2 text-center text-gray-400 text-xs">加载中...</div> : (
                    members.length > 0 ? members.map(m => {
                        const isSel = selectedUsers.some((u: any) => u.id === m.id);
                        return (
                            <div 
                                key={m.id} 
                                className={`flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm ${isSel ? 'bg-primary-50' : ''}`}
                                onClick={() => toggleUser(m)}
                            >
                                <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden shrink-0 text-xs text-gray-500 font-medium">
                                    {(m.avatar_url || m.avatar) ? <img src={m.avatar_url || m.avatar} className="w-full h-full object-cover" alt="" /> : ((m.real_name || m.name)?.[0] || 'U')}
                                </div>
                                <span className="truncate flex-1 text-gray-700">
                                    {m.real_name || m.name}
                                    {m.real_name && m.name && m.real_name !== m.name && (
                                        <span className="text-gray-400 ml-1">({m.name})</span>
                                    )}
                                </span>
                                {isSel && (
                                    <svg className="w-3 h-3 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                            </div>
                        );
                    }) : <div className="p-2 text-center text-gray-400 text-xs">无结果</div>
                )}
            </div>
        </div>
    );
};

const DepartmentSelector = ({
    value,
    onChange,
    onClose
}: {
    value: any,
    onChange: (val: any) => void,
    onClose: () => void
}) => {
    const [depts, setDepts] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [keyword, setKeyword] = useState('');
    
    // Normalize value to array
    const selectedDepts = React.useMemo(() => {
        const arr = Array.isArray(value) ? value : (value ? [value] : []);
        return arr.map(d => {
            if (typeof d === 'object' && d !== null) return d;
            return { id: d, name: 'Dept ' + d };
        });
    }, [value]);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const res = await api.getDepts();
                setDepts(res.data || []);
            } catch(e) { console.error(e); }
            setLoading(false);
        };
        load();
    }, []);

    const filteredDepts = depts.filter(d => {
        const name = d.name || d.dept_name || '';
        return name.toLowerCase().includes(keyword.toLowerCase());
    });

    const toggleDept = (dept: any) => {
        const deptId = dept.id || dept.dept_id;
        const deptName = dept.name || dept.dept_name;
        const exists = selectedDepts.find((d: any) => d.id === deptId);
        let newSel;
        if (exists) {
            newSel = selectedDepts.filter((d: any) => d.id !== deptId);
        } else {
            newSel = [...selectedDepts, { id: deptId, name: deptName }];
        }
        onChange(newSel);
    };

    return (
        <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-200 shadow-xl rounded-lg z-[120] flex flex-col overflow-hidden">
            <div className="p-2 border-b border-gray-100 flex items-center justify-between">
                <span className="text-xs font-bold text-gray-500">选择部门</span>
                <Tooltip content="关闭" className="shrink-0 flex items-center justify-center">
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <ICONS.Close className="w-4 h-4" />
                    </button>
                </Tooltip>
            </div>
            <div className="p-2 border-b border-gray-50">
                <input 
                    className="w-full text-xs px-2 py-1 bg-gray-50 border border-gray-200 rounded outline-none focus:border-primary-500"
                    placeholder="搜索部门..."
                    value={keyword}
                    onChange={e => setKeyword(e.target.value)}
                    autoFocus
                />
            </div>
            <div className="max-h-48 overflow-y-auto custom-scrollbar">
                {loading ? <div className="p-2 text-center text-gray-400 text-xs">加载中...</div> : (
                    filteredDepts.length > 0 ? filteredDepts.map(d => {
                        const deptId = d.id || d.dept_id;
                        const deptName = d.name || d.dept_name;
                        const isSel = selectedDepts.some((sel: any) => sel.id === deptId);
                        return (
                            <div 
                                key={deptId} 
                                className={`flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm ${isSel ? 'bg-primary-50' : ''}`}
                                onClick={() => toggleDept(d)}
                            >
                                <div className="w-6 h-6 rounded bg-gray-100 flex items-center justify-center shrink-0 text-gray-500">
                                    <ICONS.Building className="w-3.5 h-3.5" />
                                </div>
                                <span className="truncate flex-1 text-gray-700">{deptName}</span>
                                {isSel && (
                                    <svg className="w-3 h-3 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                            </div>
                        );
                    }) : <div className="p-2 text-center text-gray-400 text-xs">无结果</div>
                )}
            </div>
        </div>
    );
};

const FieldConfigDialog: React.FC<FieldConfigDialogProps> = ({ tableId, column, allColumns = [], allTables = [], isVisible = true, anchorEl, mode = 'modal', onClose, onSave, onDelete }) => {
  const [name, setName] = useState(column?.name || '新字段');
  const [type, setType] = useState<string>(column?.type || FieldType.TEXT);
  // Update: options are now in config
  const [options, setOptions] = useState<string[]>(column?.config?.options || []);
  // Update: optionColors are now in config
  const [optionColors, setOptionColors] = useState<Record<string, string>>(column?.config?.option_colors || {});
  
  // Use config.defaultValue if available, fallback to root
  const [defaultValue, setDefaultValue] = useState<any>(column?.config?.defaultValue ?? column?.defaultValue ?? '');
  
  const [format, setFormat] = useState(column?.config?.format || column?.format || '');
  const [formula, setFormula] = useState(column?.config?.formula || column?.formula || '');
  // Update: linkedTableId is now in config
  const [linkedTableId, setLinkedTableId] = useState(column?.config?.linked_table_id || '');
  const [visible, setVisible] = useState(isVisible);
  
  // Lookup specific states (now in config)
  const [lookupRelationColId, setLookupRelationColId] = useState(column?.config?.lookup_relation_col_id || '');
  const [lookupTargetColId, setLookupTargetColId] = useState(column?.config?.lookup_target_col_id || '');

  // Search Reference Specific States (now in config)
  const [queryTargetTableId, setQueryTargetTableId] = useState(column?.config?.search_reference_config?.target_table_id || column?.config?.target_table_id || '');
  const [queryTargetFieldId, setQueryTargetFieldId] = useState(column?.config?.search_reference_config?.target_field_id || column?.config?.target_field_id || '');
  const [queryMatchTargetFieldId, setQueryMatchTargetFieldId] = useState(column?.config?.search_reference_config?.filters?.[0]?.target_condition_field_id || column?.config?.match_target_field_id || '');
  const [queryMatchCurrentFieldId, setQueryMatchCurrentFieldId] = useState(column?.config?.search_reference_config?.filters?.[0]?.current_field_id || column?.config?.match_current_field_id || '');
  const [queryOperator, setQueryOperator] = useState(column?.config?.search_reference_config?.filters?.[0]?.operator || 'EQ');
  const [searchConditions, setSearchConditions] = useState<{label: string, value: string}[]>([]);
  const [targetTableColumns, setTargetTableColumns] = useState<Column[]>([]);

  useEffect(() => {
    // Fetch search conditions on mount to ensure Interface 54 is called
    const fetchConditions = async () => {
        try {
            const res = await api.getSearchConditions();
            if (res.data) setSearchConditions(res.data);
        } catch (err) {
            console.error("Failed to fetch search conditions", err);
        }
    };
    fetchConditions();
  }, []);

  useEffect(() => {
    // Re-fetch if type is SEARCH_REFERENCE and we don't have conditions yet
    if (type === FieldType.SEARCH_REFERENCE && searchConditions.length === 0) {
        api.getSearchConditions().then(res => {
            if (res.data) setSearchConditions(res.data);
        }).catch(err => console.error("Failed to fetch search conditions", err));
    }
  }, [type, searchConditions.length]);

  useEffect(() => {
    let targetId = '';
    if (type === FieldType.SEARCH_REFERENCE) {
      targetId = queryTargetTableId;
    } else if (type === FieldType.LOOKUP) {
      const linkFields = allColumns.filter(c => c.type === FieldType.LINK);
      const selectedRelation = linkFields.find(c => c.id === lookupRelationColId);
      targetId = selectedRelation?.config?.linked_table_id || '';
    }

    if (targetId) {
      api.getColumns(targetId).then(res => {
        if (res.data) setTargetTableColumns(res.data);
      }).catch(err => console.error("Failed to fetch target table columns", err));
    } else {
      setTargetTableColumns([]);
    }
  }, [type, queryTargetTableId, lookupRelationColId, allColumns]);
  
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [isAiOptionsLoading, setIsAiOptionsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');

  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  
  // AI Models State
  const [aiModels, setAiModels] = useState<any[]>([]);
  const [selectedModel, setSelectedModel] = useState<{ provider: string, model: string } | null>(null);
  const [isModelsLoading, setIsModelsLoading] = useState(false);

  // Field Types from API
  const [fieldTypes, setFieldTypes] = useState<{label: string, value: string}[]>([]);

  useEffect(() => {
    // Fetch dynamic field types from API
    const loadTypes = async () => {
        try {
            const res = await api.getFieldTypes();
            if (res.data && Array.isArray(res.data)) {
                setFieldTypes(res.data);
            }
        } catch (e) {
            console.warn("Failed to fetch field types from API, using local defaults.");
            // Fallback
            setFieldTypes(Object.entries(FIELD_TYPE_LABELS_DEFAULT).map(([val, label]) => ({ value: val, label })));
        }
    };
    loadTypes();
    
    // Fetch AI Models
    const loadModels = async () => {
        setIsModelsLoading(true);
        try {
            const res = await api.getModels();
            if (res.data && Array.isArray(res.data)) {
                setAiModels(res.data);
                // Select first available model by default
                for (const provider of res.data) {
                    if (provider.models && provider.models.length > 0) {
                        setSelectedModel({ 
                            provider: provider.provider, 
                            model: provider.models[0].model 
                        });
                        break;
                    }
                }
            }
        } catch (e) {
            console.error("Failed to load AI models", e);
        } finally {
            setIsModelsLoading(false);
        }
    };
    loadModels();
  }, []);

  // 默认格式初始化
  useEffect(() => {
    if (!format) {
      if (type === FieldType.NUMBER) setFormat(NUMBER_FORMATS[0].value);
      if (type === FieldType.DATE) setFormat(DATE_FORMATS[0].value);
      if (type === FieldType.TIME) setFormat(TIME_FORMATS[1].value); // Default to HH:mm
    }
  }, [type, format]);

  // 日期/时间默认值初始化 (日期默认为今天，时间默认为当前时间)
  useEffect(() => {
    if (type === FieldType.DATE && !defaultValue) {
      const d = new Date();
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const isDateTime = format?.includes('HH:mm') || DATE_FORMATS[0].value.includes('HH:mm');
      if (isDateTime) {
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        setDefaultValue(`${year}-${month}-${day}T${hours}:${minutes}`);
      } else {
        setDefaultValue(`${year}-${month}-${day}`);
      }
    } else if (type === FieldType.TIME && !defaultValue) {
      const d = new Date();
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      setDefaultValue(`${hours}:${minutes}`);
    }
  }, [type, format, defaultValue]);

  // 默认关联表初始化
  useEffect(() => {
      if (type === FieldType.LINK && !linkedTableId && allTables.length > 0) {
          setLinkedTableId(allTables[0].id);
      }
  }, [type, linkedTableId, allTables]);

  // Check if primary column (usually the first one)
  const isPrimary = allColumns.length > 0 && column?.id === allColumns[0].id;

  const handleAddOption = () => {
    setOptions([...options, '']);
  };

  // 获取选项颜色样式
  const getOptionColorStyle = (opt: string) => {
      const colorStyle = getTagColor(opt, optionColors);
      return colorStyle.bg;
  };

  const handleOptionChange = (idx: number, newVal: string) => {
      const oldVal = options[idx];
      const newOpts = [...options];
      newOpts[idx] = newVal;
      setOptions(newOpts);
      
      if (oldVal && oldVal !== newVal && optionColors[oldVal]) {
          setOptionColors(prev => {
              const newColors = { ...prev };
              newColors[newVal] = newColors[oldVal];
              delete newColors[oldVal];
              return newColors;
          });
      }
  };

  const handleAiGenerateFormula = async () => {
    if (!aiPrompt || !selectedModel) {
        if (!selectedModel) alert('请先选择 AI 模型');
        return;
    }
    setIsAiGenerating(true);
    try {
      const res = await api.generateContent({
          provider: selectedModel.provider,
          model: selectedModel.model,
          content: `作为一名专家级电子表格工程师，请帮助用户编写公式。\n    可用列：${allColumns.map(c => `${c.name} (${c.type})`).join(', ')}。\n    用户需求：${aiPrompt}。\n    仅返回公式字符串（例如："{单价} * {数量}"）。不要添加任何解释说明。`,
          role: 'user'
      });
      if (res.content) {
          // Remove any markdown code blocks if present
          let cleanFormula = res.content.replace(/```/g, '').trim();
          setFormula(cleanFormula);
      }
    } catch (error) {
      console.error('AI Formula generation failed', error);
      alert('AI 生成公式失败，请稍后重试');
    } finally {
      setIsAiGenerating(false);
    }
  };

  const handleAiGenerateOptions = async () => {
    if (!name || !selectedModel) {
        if (!selectedModel) alert('请先选择 AI 模型');
        return;
    }
    setIsAiOptionsLoading(true);
    try {
      const res = await api.generateContent({
          provider: selectedModel.provider,
          model: selectedModel.model,
          content: `用户正在创建一个名为"${name}"的单选或多选字段。\n    请根据字段名称生成 5-10 个合理的选项值。\n    仅返回选项列表，用逗号分隔，不要包含任何其他文字或编号。\n    例如：如果字段名是"优先级"，返回"最高, 高, 中, 低, 最低"。`,
          role: 'user'
      });
      
      if (res.content) {
          const generatedOptions = res.content.split(/[,，\n]/).map(s => s.trim()).filter(s => s);
          if (generatedOptions.length > 0) {
            setOptions(generatedOptions);
          } else {
            alert('AI 未能生成有效选项，请尝试更明确的字段名称');
          }
      }
    } catch (error) {
      console.error('AI Options generation failed', error);
      alert('AI 生成选项失败，请稍后重试');
    } finally {
      setIsAiOptionsLoading(false);
    }
  };

  const renderModelSelector = () => {
      const options: SelectOption[] = isModelsLoading ? [{ label: '加载模型中...', value: '' }] : aiModels.flatMap((provider: any) => 
          (provider.models || []).map((model: any) => {
              const modelId = model.model || '';
              const modelLabel = model.label?.zh_Hans || modelId;
              const hasVisionFeature = Array.isArray(model.features) && model.features.some((f: any) => typeof f === 'string' && f.toLowerCase().includes('vision'));
              const contains4v = modelId.toLowerCase().includes('4v') || modelLabel.toLowerCase().includes('4v');
              const isVision = hasVisionFeature || contains4v;
              
              return {
                  label: modelLabel,
                  value: `${provider.provider}:${modelId}`,
                  group: provider.label?.zh_Hans || provider.provider,
                  icon: provider.icon_small?.zh_Hans,
                  mode: model.model_properties?.mode,
                  isVision: isVision
              };
          })
      );

      return (
          <div className="flex items-center gap-2 mb-2">
              <label className="text-[10px] font-bold text-gray-400 uppercase shrink-0">AI 模型</label>
              <div className="flex-1">
                  <Select 
                      options={options}
                      value={selectedModel ? `${selectedModel.provider}:${selectedModel.model}` : ''}
                      onChange={(val) => {
                          if (!val) return;
                          const [p, m] = val.split(':');
                          setSelectedModel({ provider: p, model: m });
                      }}
                      disabled={isModelsLoading}
                      triggerClassName="w-full min-h-[28px] px-2 py-1 bg-white border rounded flex items-center justify-between transition-all duration-200 text-xs shadow-sm"
                      portal={true}
                      isModelSelector={true}
                  />
              </div>
          </div>
      );
  };

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
        const cleanOptionColors: Record<string, string> = {};
        if ([FieldType.SELECT, FieldType.MULTI_SELECT].includes(type as FieldType)) {
            options.forEach(opt => {
                if (optionColors[opt]) {
                    cleanOptionColors[opt] = optionColors[opt];
                }
            });
        }

        // Construct the config object, merging with existing keys to prevent data loss if any
        const existingConfig = column?.config || {};
        
        // Masquerade DEPARTMENT as TEXT for backend compatibility
        let finalType = type;
        if (type === FieldType.DEPARTMENT) {
            finalType = FieldType.TEXT;
        }

        const newConfig = {
            ...existingConfig,
            originalType: type === FieldType.DEPARTMENT ? FieldType.DEPARTMENT : undefined,
            options: [FieldType.SELECT, FieldType.MULTI_SELECT].includes(type as FieldType) ? options : undefined,
            option_colors: [FieldType.SELECT, FieldType.MULTI_SELECT].includes(type as FieldType) ? cleanOptionColors : undefined,
            linked_table_id: type === FieldType.LINK ? linkedTableId : undefined,
            lookup_relation_col_id: type === FieldType.LOOKUP ? lookupRelationColId : undefined,
            lookup_target_col_id: type === FieldType.LOOKUP ? lookupTargetColId : undefined,
            search_reference_config: type === FieldType.SEARCH_REFERENCE ? {
                target_table_id: queryTargetTableId,
                target_field_id: queryTargetFieldId,
                filters: [{
                    target_condition_field_id: queryMatchTargetFieldId,
                    operator: queryOperator,
                    current_field_id: queryMatchCurrentFieldId
                }]
            } : undefined,
            // Legacy fields for backward compatibility (required by backend)
            target_table_id: type === FieldType.SEARCH_REFERENCE ? queryTargetTableId : undefined,
            target_field_id: type === FieldType.SEARCH_REFERENCE ? queryTargetFieldId : undefined,
            match_target_field_id: type === FieldType.SEARCH_REFERENCE ? queryMatchTargetFieldId : undefined,
            match_current_field_id: type === FieldType.SEARCH_REFERENCE ? queryMatchCurrentFieldId : undefined,
            
            // Save defaultValue in config
            defaultValue: defaultValue,
            // Save format in config
            format: [FieldType.NUMBER, FieldType.DATE, FieldType.TIME].includes(type as FieldType) ? format : undefined,
            // Save formula in config
            formula: type === FieldType.FORMULA ? formula : undefined
        };

        await onSave({
          id: column?.id || `c${Date.now()}`,
          name,
          type: finalType as FieldType,
          width: column?.width || 150,
          sort: column?.sort,
          defaultValue: defaultValue, // Keep top-level for frontend if needed
          format: [FieldType.NUMBER, FieldType.DATE, FieldType.TIME].includes(type as FieldType) ? format : undefined,
          formula: type === FieldType.FORMULA ? formula : undefined,
          config: newConfig
        }, visible);
    } finally {
        setIsSaving(false);
    }
  };

  const handleDelete = () => {
      setShowConfirmDelete(true);
  };

  const confirmDelete = () => {
      if (column && onDelete && !isPrimary) {
          onDelete(column.id); // Direct call, handled by parent state update
          onClose();
      }
      setShowConfirmDelete(false);
  };

  const renderTypeSpecificConfigs = () => {
    switch (type) {
      case FieldType.NUMBER:
        return (
          <section>
            <label className="block text-xs font-semibold text-gray-400 uppercase mb-2">数据格式</label>
            <Select 
              portal={true}
              options={NUMBER_FORMATS}
              value={format}
              onChange={(val) => setFormat(val)}
            />
          </section>
        );
      case FieldType.DATE:
        return (
          <section>
            <label className="block text-xs font-semibold text-gray-400 uppercase mb-2">日期显示格式</label>
            <Select 
              portal={true}
              options={DATE_FORMATS}
              value={format}
              onChange={(val) => {
                setFormat(val);
                // Adjust defaultValue to match format style (date vs datetime-local)
                const d = new Date();
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                const isDateTime = val.includes('HH:mm');
                if (isDateTime) {
                  const hours = String(d.getHours()).padStart(2, '0');
                  const minutes = String(d.getMinutes()).padStart(2, '0');
                  setDefaultValue(`${year}-${month}-${day}T${hours}:${minutes}`);
                } else {
                  setDefaultValue(`${year}-${month}-${day}`);
                }
              }}
            />
          </section>
        );
      case FieldType.TIME:
        return (
          <section>
            <label className="block text-xs font-semibold text-gray-400 uppercase mb-2">时间显示格式</label>
            <Select 
              portal={true}
              options={TIME_FORMATS}
              value={format}
              onChange={(val) => setFormat(val)}
            />
          </section>
        );
      case FieldType.SELECT:
      case FieldType.MULTI_SELECT:
        return (
          <section className="space-y-3">
            {renderModelSelector()}
            <div className="flex justify-between items-center">
              <label className="block text-xs font-semibold text-gray-400 uppercase">选项内容</label>
              <div className="flex items-center gap-3">
                  {options.length > 0 && (
                      <button 
                        onClick={() => setShowConfirmClear(true)}
                        className="text-[10px] text-gray-400 font-bold hover:text-red-500 transition-colors"
                      >
                        清空
                      </button>
                  )}
                  <button 
                    onClick={handleAiGenerateOptions}
                    disabled={isAiOptionsLoading || !name}
                    className="text-[10px] text-primary-600 font-bold flex items-center gap-1 hover:text-primary-800 disabled:opacity-50 transition-colors"
                  >
                    {isAiOptionsLoading ? '生成中...' : (
                      <>
                        <ICONS.Robot />
                        AI 生成选项
                      </>
                    )}
                  </button>
              </div>
            </div>
            <div className="max-h-40 overflow-y-auto space-y-2 pr-2">
              {options.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-gray-50 border border-gray-100 px-2 py-1.5 rounded-md hover:border-gray-200 transition-colors group">
                  <OptionColorPicker 
                      color={optionColors[opt] || 'gray'} 
                      onChange={(color) => {
                          setOptionColors(prev => ({ ...prev, [opt]: color }));
                      }}
                      trigger={
                          <Tooltip content="点击修改颜色">
                              <div className={`w-4 h-4 rounded-full flex-shrink-0 border border-gray-200 shadow-sm cursor-pointer ${getOptionColorStyle(opt)}`} />
                          </Tooltip>
                      }
                  />
                  <input 
                    value={opt}
                    onChange={(e) => handleOptionChange(idx, e.target.value)}
                    className="flex-1 text-sm bg-transparent outline-none text-gray-700"
                    placeholder="输入选项名称"
                  />
                  <button onClick={() => setOptions(options.filter((_, i) => i !== idx))} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1">
                    <ICONS.Close className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {options.length === 0 && (
                <div className="text-xs text-gray-400 text-center py-2">暂无选项，请手动添加或使用 AI 生成</div>
              )}
            </div>
            <button 
              onClick={handleAddOption}
              className="w-full py-2 border border-dashed border-gray-200 rounded-lg text-xs text-primary-500 hover:bg-primary-50 font-medium"
            >
              + 添加选项
            </button>
          </section>
        );
      case FieldType.FORMULA:
        return (
          <section className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase mb-2">公式编辑</label>
              <textarea 
                value={formula}
                onChange={(e) => setFormula(e.target.value)}
                rows={3}
                placeholder="例如: {单价} * {数量}"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-primary-500 outline-none bg-gray-50"
              />
              <div className="text-[10px] text-gray-400 mt-1">使用 {"{列名}"} 来引用表中的其它字段</div>
            </div>
            
            <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100 space-y-2">
              <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs uppercase">
                <ICONS.Robot /> AI 公式助手
              </div>
              {renderModelSelector()}
              <div className="flex gap-2">
                <input 
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="描述你想要实现的逻辑..."
                  className="flex-1 text-xs border border-indigo-200 rounded px-2 py-1.5 focus:ring-1 focus:ring-indigo-500 outline-none"
                />
                <button 
                  onClick={handleAiGenerateFormula}
                  disabled={isAiGenerating || !aiPrompt}
                  className="bg-indigo-600 text-white text-[10px] font-bold px-3 py-1.5 rounded hover:bg-indigo-700 disabled:opacity-50 transition-all shrink-0"
                >
                  {isAiGenerating ? '生成中...' : 'AI 生成'}
                </button>
              </div>
            </div>
          </section>
        );
      case FieldType.LINK:
        return (
            <section>
                <label className="block text-xs font-semibold text-gray-400 uppercase mb-2">关联目标表</label>
                <Select 
                    portal={true}
                    options={allTables.map(t => ({ label: t.name, value: t.id }))}
                    value={linkedTableId}
                    onChange={(val) => setLinkedTableId(val)}
                />
                <p className="text-[10px] text-gray-400 mt-1">
                    选择要引用的数据表。修改目标表的数据时，此处会自动更新。
                </p>
            </section>
        );
      case FieldType.LOOKUP:
        const linkFields = allColumns.filter(c => c.type === FieldType.LINK);
        const selectedRelation = linkFields.find(c => c.id === lookupRelationColId);
        const targetTable = selectedRelation ? allTables.find(t => t.id === selectedRelation.config?.linked_table_id) : null;

        return (
            <section className="space-y-4">
                <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase mb-2">1. 选择关联字段</label>
                    {linkFields.length > 0 ? (
                        <Select 
                            portal={true}
                            options={[
                                { label: '请选择...', value: '' },
                                ...linkFields.map(c => ({ label: c.name, value: c.id }))
                            ]}
                            value={lookupRelationColId}
                            onChange={(val) => {
                                setLookupRelationColId(val);
                                setLookupTargetColId('');
                            }}
                        />
                    ) : (
                        <div className="text-xs text-orange-600 bg-orange-50 p-2 rounded border border-orange-100">
                            当前表没有关联字段，无法使用引用功能。请先创建一个“关联引用”字段。
                        </div>
                    )}
                </div>

                {targetTable && (
                    <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                        <label className="block text-xs font-semibold text-gray-400 uppercase mb-2">
                            2. 选择要显示的字段 ({targetTable.name})
                        </label>
                        <Select 
                            portal={true}
                            options={[
                                { label: '请选择...', value: '' },
                                ...targetTableColumns.map(c => ({ label: c.name, value: c.id }))
                            ]}
                            value={lookupTargetColId}
                            onChange={(val) => setLookupTargetColId(val)}
                        />
                    </div>
                )}
            </section>
        );
        case FieldType.SEARCH_REFERENCE:
            const queryTargetTable = allTables.find(t => t.id === queryTargetTableId);
            return (
                <section className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase mb-2">需要引用的字段</label>
                        <div className="flex gap-2">
                            <div className="flex-1">
                                <Select 
                                    portal={true}
                                    options={[
                                        { label: '引用字段所在的数据表', value: '' },
                                        ...allTables.map(t => ({ label: t.name, value: t.id }))
                                    ]}
                                    value={queryTargetTableId}
                                    onChange={(val) => {
                                        setQueryTargetTableId(val);
                                        setQueryTargetFieldId('');
                                        setQueryMatchTargetFieldId('');
                                    }}
                                />
                            </div>
                            <div className="flex-1">
                                <Select 
                                    portal={true}
                                    options={[
                                        { label: '选择引用字段', value: '' },
                                        ...targetTableColumns.map(c => ({ label: c.name, value: c.id }))
                                    ]}
                                    value={queryTargetFieldId}
                                    onChange={(val) => setQueryTargetFieldId(val)}
                                    disabled={!queryTargetTable}
                                />
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase mb-2">查找条件</label>
                        <div className="flex items-center gap-2">
                            <div className="flex-1">
                                <Select 
                                    portal={true}
                                    options={[
                                        { label: '引用表中的字段', value: '' },
                                        ...targetTableColumns.map(c => ({ label: c.name, value: c.id }))
                                    ]}
                                    value={queryMatchTargetFieldId}
                                    onChange={(val) => setQueryMatchTargetFieldId(val)}
                                    disabled={!queryTargetTable}
                                />
                            </div>
                            
                            <div className="flex-1">
                                <Select 
                                    portal={true}
                                    options={searchConditions.length > 0 ? searchConditions : [{ label: '等于', value: 'EQ' }]}
                                    value={queryOperator}
                                    onChange={(val) => setQueryOperator(val)}
                                />
                            </div>

                            <div className="flex-1">
                                <Select 
                                    portal={true}
                                    options={[
                                        { label: '当前表中的字段', value: '' },
                                        ...allColumns.map(c => ({ label: c.name, value: c.id }))
                                    ]}
                                    value={queryMatchCurrentFieldId}
                                    onChange={(val) => setQueryMatchCurrentFieldId(val)}
                                />
                            </div>
                        </div>
                        <div className="mt-2 text-primary-600 text-xs font-medium cursor-pointer hover:underline flex items-center gap-1">
                            <ICONS.Plus className="w-3 h-3"/> 添加条件
                        </div>
                    </div>
                </section>
            );
      default:
        return null;
    }
  };

  const [showUserSelector, setShowUserSelector] = useState(false);
  const [showDeptSelector, setShowDeptSelector] = useState(false);

  const renderDefaultValueInput = () => {
    if (type === FieldType.FORMULA || type === FieldType.LINK || type === FieldType.LOOKUP || type === FieldType.SEARCH_REFERENCE || type === FieldType.ATTACHMENT) return null;
    
    switch (type) {
      case FieldType.USER:
          const users = parseJsonArray(defaultValue);
          return (
              <div className="relative">
                  <div 
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm min-h-[38px] flex flex-wrap gap-1 cursor-pointer bg-white items-center"
                      onClick={() => setShowUserSelector(!showUserSelector)}
                  >
                      {users.length > 0 ? users.map((u: any, i: number) => (
                          <div key={i} className="flex items-center gap-1 bg-primary-50 text-primary-700 px-1.5 py-0.5 rounded-full text-[10px] border border-primary-100 shrink-0">
                              <div className="w-3.5 h-3.5 rounded-full bg-primary-200 flex items-center justify-center overflow-hidden text-[8px]">
                                  {(u.avatar_url || u.avatar) ? <img src={u.avatar_url || u.avatar} className="w-full h-full object-cover" alt="" /> : ((u.real_name || u.name)?.[0] || 'U')}
                              </div>
                              <span className="truncate max-w-[60px]">{u.real_name || u.name}</span>
                              <button 
                                  className="ml-0.5 hover:text-primary-900"
                                  onClick={(e) => {
                                      e.stopPropagation();
                                      const nextUsers = users.filter((_: any, index: number) => index !== i);
                                      setDefaultValue(nextUsers.length > 0 ? nextUsers : []);
                                  }}
                              >
                                  <ICONS.Close className="w-3 h-3" />
                              </button>
                          </div>
                      )) : <span className="text-gray-400 text-xs">点击选择默认人员</span>}
                  </div>
                  {showUserSelector && (
                      <UserSelector 
                          value={defaultValue} 
                          onChange={(val) => setDefaultValue(val)} 
                          onClose={() => setShowUserSelector(false)} 
                      />
                  )}
              </div>
          );
      case FieldType.DEPARTMENT:
          const depts = parseJsonArray(defaultValue);
          return (
              <div className="relative">
                  <div 
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm min-h-[38px] flex flex-wrap gap-1 cursor-pointer bg-white items-center"
                      onClick={() => setShowDeptSelector(!showDeptSelector)}
                  >
                      {depts.length > 0 ? depts.map((d: any, i: number) => (
                          <div key={i} className="flex items-center gap-1 bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded text-[10px] border border-gray-200 shrink-0">
                              <ICONS.Building className="w-3 h-3 text-gray-500" />
                              <span className="truncate max-w-[80px]">{d.name || d.dept_name}</span>
                          </div>
                      )) : <span className="text-gray-400 text-xs">点击选择默认部门</span>}
                  </div>
                  {showDeptSelector && (
                      <DepartmentSelector 
                          value={defaultValue} 
                          onChange={(val) => setDefaultValue(val)} 
                          onClose={() => setShowDeptSelector(false)} 
                      />
                  )}
              </div>
          );
      case FieldType.SELECT:
        return (
          <Select 
            portal={true}
            options={[
              { label: '请选择选项', value: '' },
              ...options.map(opt => ({ label: opt, value: opt }))
            ]}
            value={defaultValue}
            onChange={(val) => setDefaultValue(val)}
          />
        );
      case FieldType.NUMBER:
        return (
          <input 
            type="number"
            value={defaultValue}
            onChange={(e) => setDefaultValue(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
            placeholder="输入默认数字"
          />
        );
      case FieldType.DATE:
        const inputType = format.includes('HH:mm') ? 'datetime-local' : 'date';
        return (
          <input 
            type={inputType}
            value={defaultValue}
            onChange={(e) => setDefaultValue(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
          />
        );
      case FieldType.TIME:
        return (
          <input 
            type="time"
            step={format?.includes('ss') ? "1" : undefined}
            value={defaultValue}
            onChange={(e) => setDefaultValue(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
          />
        );
      case FieldType.CHECKBOX:
        return (
            <div className="flex items-center gap-2">
                <input 
                    type="checkbox" 
                    checked={!!defaultValue} 
                    onChange={(e) => setDefaultValue(e.target.checked)} 
                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500" 
                />
                <span className="text-sm text-gray-600">默认勾选</span>
            </div>
        );
      default:
        return (
          <input 
            value={defaultValue}
            onChange={(e) => setDefaultValue(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
            placeholder="输入默认内容"
          />
        );
    }
  };

  const [position, setPosition] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (mode === 'popover' && anchorEl) {
       let top = 0;
       let left = 0;
       if (anchorEl instanceof HTMLElement) {
           const rect = anchorEl.getBoundingClientRect();
           top = rect.top;
           left = rect.right + 8;
       } else if (anchorEl && 'top' in anchorEl) {
           top = anchorEl.top;
           left = anchorEl.left;
       }
       
       // Boundary check
       if (top + 600 > window.innerHeight) {
           top = window.innerHeight - 600;
       }
       if (left + 340 > window.innerWidth) {
           left = window.innerWidth - 340;
       }
       if (top < 0) top = 20;
       if (left < 0) left = 20;

       setPosition({ top, left });
    }
  }, [anchorEl, mode]);

  const content = (
      <div 
        data-modal-portal="true"
        className={`bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 ${mode === 'modal' ? 'w-full max-w-md' : (type === FieldType.SEARCH_REFERENCE ? 'w-[420px]' : 'w-[320px]') + ' max-h-[600px] border border-gray-200'}`}
      >
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto custom-scrollbar">
          <section>
            <label className="block text-xs font-semibold text-gray-400 uppercase mb-2">标题</label>
            <input 
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              placeholder="输入字段名称"
            />
          </section>

          <section>
            <label className="block text-xs font-semibold text-gray-400 uppercase mb-2">字段类型</label>
            <Select 
              portal={true}
              options={fieldTypes.map(t => ({ label: t.label, value: t.value }))}
              value={type}
              onChange={(val) => {
                setType(val);
                let targetFormat = '';
                if (val === FieldType.NUMBER) targetFormat = NUMBER_FORMATS[0].value;
                if (val === FieldType.DATE) targetFormat = DATE_FORMATS[0].value;
                if (val === FieldType.TIME) targetFormat = TIME_FORMATS[1].value;
                if (targetFormat) setFormat(targetFormat);

                if (val === FieldType.DATE) {
                  const d = new Date();
                  const year = d.getFullYear();
                  const month = String(d.getMonth() + 1).padStart(2, '0');
                  const day = String(d.getDate()).padStart(2, '0');
                  const isDateTime = (targetFormat || '').includes('HH:mm');
                  if (isDateTime) {
                    const hours = String(d.getHours()).padStart(2, '0');
                    const minutes = String(d.getMinutes()).padStart(2, '0');
                    setDefaultValue(`${year}-${month}-${day}T${hours}:${minutes}`);
                  } else {
                    setDefaultValue(`${year}-${month}-${day}`);
                  }
                } else if (val === FieldType.TIME) {
                  const d = new Date();
                  const hours = String(d.getHours()).padStart(2, '0');
                  const minutes = String(d.getMinutes()).padStart(2, '0');
                  setDefaultValue(`${hours}:${minutes}`);
                } else {
                  setDefaultValue('');
                }
              }}
            />
          </section>

          {renderTypeSpecificConfigs()}

          {type !== FieldType.FORMULA && type !== FieldType.LINK && type !== FieldType.LOOKUP && type !== FieldType.SEARCH_REFERENCE && (
            <section>
               <label className="block text-xs font-semibold text-gray-400 uppercase mb-2">默认值</label>
               {renderDefaultValueInput()}
            </section>
          )}

          <section className="pt-2 border-t border-gray-100 flex items-center justify-between">
             <label className="text-sm font-medium text-gray-700">在当前视图中显示</label>
             <button 
                onClick={() => setVisible(!visible)}
                className={`w-11 h-6 flex items-center rounded-full transition-colors duration-200 ease-in-out ${visible ? 'bg-primary-600' : 'bg-gray-200'}`}
             >
                <span className={`w-4 h-4 bg-white rounded-full shadow transform transition-transform duration-200 ease-in-out ${visible ? 'translate-x-6' : 'translate-x-1'}`} />
             </button>
          </section>

        </div>

        <div className="bg-gray-50 p-4 flex justify-between items-center border-t border-gray-100">
           <div>
              {column && onDelete && !isPrimary && (
                  <button 
                    onClick={handleDelete}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-2 rounded-lg text-sm font-bold transition-colors"
                  >
                    删除字段
                  </button>
              )}
           </div>
           <div className="flex gap-3">
              <button onClick={onClose} className="px-6 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">取消</button>
              <button 
                onClick={handleSave} 
                disabled={isSaving}
                className="px-6 py-2 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? '保存中...' : '确定'}
              </button>
           </div>
        </div>
      </div>
  );

  if (mode === 'popover') {
      return createPortal(
          <>
             <div className="fixed inset-0 z-[110]" onClick={onClose} data-modal-portal="true" />
             <div className="fixed z-[111]" style={{ top: position.top, left: position.left }} data-modal-portal="true">
                 {content}
             </div>
             
             <ConfirmDialog 
                isOpen={showConfirmDelete} 
                title="删除字段" 
                message="确定要删除此字段吗？与该字段相关的所有数据将永久丢失。" 
                onConfirm={confirmDelete} 
                onCancel={() => setShowConfirmDelete(false)} 
             />

             <ConfirmDialog 
                isOpen={showConfirmClear} 
                title="清空选项" 
                message="确定要清空所有选项吗？此操作将移除所有已定义的选项。" 
                onConfirm={() => { setOptions([]); setShowConfirmClear(false); }} 
                onCancel={() => setShowConfirmClear(false)} 
             />
          </>,
          document.body
      );
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-[110] flex items-center justify-center p-4">
      {content}

      <ConfirmDialog 
        isOpen={showConfirmDelete} 
        title="删除字段" 
        message="确定要删除此字段吗？与该字段相关的所有数据将永久丢失。" 
        onConfirm={confirmDelete} 
        onCancel={() => setShowConfirmDelete(false)} 
      />

      <ConfirmDialog 
        isOpen={showConfirmClear} 
        title="清空选项" 
        message="确定要清空所有选项吗？此操作将移除所有已定义的选项。" 
        onConfirm={() => { setOptions([]); setShowConfirmClear(false); }} 
        onCancel={() => setShowConfirmClear(false)} 
      />
    </div>
  );
};

export default FieldConfigDialog;
