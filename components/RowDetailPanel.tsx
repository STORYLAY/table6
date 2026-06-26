import React, { useState, useEffect } from 'react';
import { Column, Row, FieldType, Table } from '../types';
import { evaluateFormula } from '../formulaUtils';
import { Dropdown } from './Dropdown';
import { ICONS, FIELD_TYPE_ICONS, formatFieldValue, getTagColor, formatDateForInput, formatDateForDisplay, formatTimeForDisplay, parseJsonArray, parseLinkValues } from '../constants';
import { api } from '../services/api';
import { motion, AnimatePresence } from 'framer-motion';
import { FilePreviewModal } from './FilePreviewModal';
import { toast } from 'sonner';
import { UserCellDisplay } from './UserCellDisplay';
import { ClickOutsideWrapper } from './ClickOutsideWrapper';
import LinkRecordDialog from './LinkRecordDialog';
import { Tooltip } from './Tooltip';
import { createPortal } from 'react-dom';

const EMPTY_ARRAY: any[] = [];

const LinkedRecordsTable = ({ 
    tableId, 
    records, 
    sourceTableId,
    sourceRowId,
    sourceColId,
    onChange 
}: { 
    tableId: string, 
    records: {id: string, name: string}[],
    sourceTableId: string,
    sourceRowId: string,
    sourceColId: string,
    onChange: (rowId: string, colId: string, value: any) => void
}) => {
    const [columns, setColumns] = useState<Column[]>([]);
    const [rows, setRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(false);
    const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
    const [previewFile, setPreviewFile] = useState<{ blob: Blob, filename: string } | null>(null);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);

    const handlePreview = async (f: any) => {
        try {
            setIsPreviewLoading(true);
            const fileId = typeof f === 'object' ? f.id : f;
            const filename = typeof f === 'object' ? (f.filename || f.name) : f;
            const blob = await api.getFileBlob(fileId);
            setPreviewFile({ blob, filename: filename || '文件' });
        } catch (e: any) {
            console.error('Preview failed:', e);
            toast.error(e.message || '获取文件内容失败');
        } finally {
            setIsPreviewLoading(false);
        }
    };

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                // 1. Get Columns
                const tableRes = await api.getTableDetail(tableId);
                if (tableRes.data) {
                    setColumns(tableRes.data.columns);
                }

                // 2. Get Rows
                if (records.length > 0) {
                    const validRecords = records.filter(r => r.id && r.id !== 'undefined');
                    const rowPromises = validRecords.map(r => api.getRowDetail(tableId, r.id));
                    const responses = await Promise.all(rowPromises);
                    const fetchedRows = responses.map(r => r.data).filter(r => r);
                    setRows(fetchedRows);
                } else {
                    setRows([]);
                }
            } catch (e) {
                console.error("Failed to load linked records", e);
            } finally {
                setLoading(false);
            }
        };
        if (tableId) {
            load();
        }
    }, [tableId, records]);

    // Helper to render cell content based on type (simplified)
    const renderCell = (row: Row, col: Column) => {
        const val = row.data[col.id];
        if (val === null || val === undefined || val === '') return '';
        
        switch (col.type) {
            case FieldType.SELECT:
            case FieldType.MULTI_SELECT:
                const values = Array.isArray(val) ? val : String(val).split(',');
                return (
                    <div className="flex flex-wrap gap-1">
                        {values.map((v: string, i: number) => {
                            const colorStyle = getTagColor(v, col.config?.option_colors);
                            return (
                                <span key={i} className={`px-2 py-0.5 rounded-full text-[10px] border ${colorStyle.bg} ${colorStyle.text} ${colorStyle.border}`}>
                                    {v}
                                </span>
                            );
                        })}
                    </div>
                );
            case FieldType.CHECKBOX:
                return val ? <ICONS.Check className="w-3 h-3 text-primary-600" /> : null;
            case FieldType.USER:
            case FieldType.DEPARTMENT:
                return <UserCellDisplay tableId={tableId} rowId={row.id} colId={col.id} value={val} />;
            case FieldType.ATTACHMENT:
                const files = parseJsonArray(val);
                if (files.length === 0) return '';
                return (
                    <div className="flex flex-wrap gap-1.5">
                        {files.map((file: any, i: number) => {
                            const filename = typeof file === 'object' ? (file.filename || file.name) : String(file);
                            const ext = String(file.extension || filename?.split('.').pop() || 'FILE').toUpperCase();
                            return (
                                <div 
                                    key={i} 
                                    className="flex items-center justify-center w-8 h-8 bg-primary-100 text-primary-700 rounded-lg border border-primary-200 shrink-0 cursor-pointer hover:bg-primary-200 hover:border-primary-300 transition-all group/file shadow-sm"
                                    onClick={() => handlePreview(file)}
                                >
                                    <Tooltip content={filename} className="w-full h-full flex items-center justify-center">
                                        <span className="font-bold text-[9px] uppercase">{ext.substring(0, 4)}</span>
                                    </Tooltip>
                                </div>
                            );
                        })}
                    </div>
                );
            case FieldType.LINK:
                const links = parseLinkValues(val);
                if (links.length === 0) return '';
                return (
                    <div className="flex flex-wrap gap-1">
                        {links.map((link: any, i: number) => {
                            const linkName = typeof link === 'object' ? (link.name || link.id) : String(link);
                            return (
                                <span key={i} className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] border border-blue-100 truncate max-w-[120px]">
                                    {linkName || '未知记录'}
                                </span>
                            );
                        })}
                    </div>
                );
            case FieldType.DATE:
                return <span className="text-gray-600 text-[10px]">{formatDateForDisplay(val, col.config?.format)}</span>;
            case FieldType.TIME:
                return <span className="text-gray-600 text-[10px]">{formatTimeForDisplay(val, col.config?.format)}</span>;
            case FieldType.HYPERLINK:
                const url = String(val).startsWith('http') ? String(val) : `https://${val}`;
                return <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline truncate block max-w-[200px] text-[10px]">{String(val)}</a>;
            default:
                return <div className="break-words max-w-[400px] text-[11px] leading-relaxed text-gray-700">{String(val)}</div>;
        }
    };

    const handleConfirmLinks = (selectedRows: Row[], targetColumns: Column[]) => {
        // We only save the {id, name} objects to the value for UI consistency before a reload
        const primaryColId = targetColumns[0]?.id;
        const newLinks = selectedRows.map(r => {
            if ('data' in r && r.data && primaryColId) {
                return { id: String(r.id), name: String(r.data[primaryColId]) };
            }
            if ('name' in r) {
                return { id: String(r.id), name: String((r as any).name) };
            }
            return { id: String(r.id), name: String(r.id) };
        });
        onChange(sourceRowId, sourceColId, newLinks);
        setIsLinkDialogOpen(false);
    };

    return (
        <div className="w-full text-sm mt-1 mb-2">
            <div className="flex items-center mb-2">
                <button 
                    onClick={() => setIsLinkDialogOpen(true)}
                    className="flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium px-2 py-1 -ml-2 rounded hover:bg-blue-50 transition-colors"
                >
                    <ICONS.Plus className="w-4 h-4" />
                    添加记录 <ICONS.ChevronDown className="w-3 h-3 opacity-50 ml-1" />
                </button>
            </div>
            
            <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
                <div className="overflow-x-auto overflow-y-hidden">
                    <table className="w-full table-fixed border-collapse">
                        <thead className="bg-gray-50/50 border-b border-gray-200">
                            <tr>
                                <th className="w-10 px-2 py-2 text-center border-r border-gray-200 bg-gray-50/30">
                                    <div className="flex items-center justify-center">
                                        <div className="w-3.5 h-3.5 border border-gray-300 rounded-sm"></div>
                                    </div>
                                </th>
                                {columns.map((c, i) => ( 
                                    <th key={c.id} style={{ width: c.width || 150 }} className="px-3 py-2 text-left font-medium text-gray-500 text-[11px] whitespace-nowrap border-r border-gray-200 last:border-r-0 uppercase tracking-tight">
                                        <div className="flex items-center gap-1.5">
                                            {FIELD_TYPE_ICONS[c.type]}
                                            {c.name}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {loading && rows.length === 0 ? (
                                <tr>
                                    <td colSpan={columns.length + 1} className="px-3 py-4 text-center text-xs text-gray-400">正在加载...</td>
                                </tr>
                            ) : rows.length === 0 ? (
                                <tr>
                                    <td colSpan={columns.length + 1} className="bg-white">
                                        <div className="h-8 flex items-center px-4 hover:bg-gray-50 cursor-pointer" onClick={() => setIsLinkDialogOpen(true)}>
                                            <ICONS.Plus className="w-4 h-4 text-gray-400" />
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                <>
                                    {rows.map((r, i) => (
                                        <tr key={r.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50 bg-white">
                                            <td className="w-10 px-2 py-2 text-center text-gray-400 text-xs border-r border-gray-200">
                                                {i + 1}
                                            </td>
                                            {columns.map((c, j) => (
                                                <td key={c.id} style={{ width: c.width || 150 }} className="px-3 py-2 text-gray-800 text-xs align-top border-r border-gray-200 last:border-r-0">
                                                    {renderCell(r, c)}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                    <tr className="bg-white">
                                        <td colSpan={columns.length + 1}>
                                            <div className="h-8 flex items-center px-4 hover:bg-gray-50 cursor-pointer group" onClick={() => setIsLinkDialogOpen(true)}>
                                                <ICONS.Plus className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
                                            </div>
                                        </td>
                                    </tr>
                                </>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {isLinkDialogOpen && (
                <LinkRecordDialog
                    isOpen={isLinkDialogOpen}
                    onClose={() => setIsLinkDialogOpen(false)}
                    onConfirm={handleConfirmLinks}
                    targetTableId={tableId}
                    sourceTableId={sourceTableId}
                    sourceRowId={sourceRowId}
                    sourceColId={sourceColId}
                    initialSelectedValues={records}
                    title="关联记录"
                />
            )}

            <AnimatePresence>
                {previewFile && (
                    <FilePreviewModal
                        isOpen={true}
                        fileBlob={previewFile.blob}
                        filename={previewFile.filename}
                        onClose={() => setPreviewFile(null)}
                    />
                )}
            </AnimatePresence>

            {/* Loading Overlay */}
            {isPreviewLoading && (
                <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center">
                    <div className="bg-white rounded-lg p-4 flex items-center gap-3 shadow-xl">
                        <div className="w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-sm font-medium text-gray-700">加载预览中...</span>
                    </div>
                </div>
            )}
        </div>
    );
};

const LinkFieldDisplay = ({
    sourceTableId,
    sourceRowId,
    sourceColId,
    linkedTableId,
    initialRecords,
    onChange
}: {
    sourceTableId: string,
    sourceRowId: string,
    sourceColId: string,
    linkedTableId: string,
    initialRecords: {id: string, name: string}[],
    onChange: (rowId: string, colId: string, value: any) => void
}) => {
    const [fetchedRecords, setFetchedRecords] = useState<{id: string, name: string}[] | null>(null);
    const [loading, setLoading] = useState(false);

    const prevInitialRecords = React.useRef(initialRecords);

    useEffect(() => {
        // Sync when initialRecords actually changes structurally (e.g. user confirmed new selection)
        if (prevInitialRecords.current !== initialRecords) {
            setFetchedRecords(initialRecords);
            prevInitialRecords.current = initialRecords;
        }
    }, [initialRecords]);

    useEffect(() => {
        const fetchLinkedIds = async () => {
            // Only fetch if it's not a temporary new row
            if (!sourceRowId || String(sourceRowId) === 'new' || String(sourceRowId).startsWith('new_') || sourceRowId === 'undefined') {
                setFetchedRecords(initialRecords);
                return;
            }
            
            setLoading(true);
            try {
                const res: any = await api.getCellLink(sourceTableId, sourceRowId, sourceColId);
                const rowIds = res?.data?.row_ids || res?.row_ids;
                if (Array.isArray(rowIds)) {
                    setFetchedRecords(rowIds.map((id: string) => ({ id, name: id })));
                } else {
                    setFetchedRecords(initialRecords);
                }
            } catch (err) {
                console.error("Failed to load linked row ids", err);
                setFetchedRecords(initialRecords);
            } finally {
                setLoading(false);
            }
        };
        fetchLinkedIds();
    }, [sourceTableId, sourceRowId, sourceColId]);

    if (loading && !fetchedRecords) return <div className="text-sm text-gray-400 italic py-1">正在获取关联数据...</div>;
    
    // Fall back to initialRecords if fetchedRecords is somehow null
    const displayRecords = fetchedRecords || initialRecords;
    
    return (
        <LinkedRecordsTable 
            tableId={linkedTableId} 
            records={displayRecords} 
            sourceTableId={sourceTableId}
            sourceRowId={sourceRowId}
            sourceColId={sourceColId}
            onChange={onChange}
        />
    );
};

interface RowDetailPanelProps {
  tableId: string;
  row: Row;
  columns: Column[];
  onClose: () => void;
  onChange: (rowId: string, colId: string, value: any) => void;
  onAddColumn?: () => void;
  onColumnChange?: (colId: string, newConfig: any) => void;
  onConfirm?: () => void;
  isNew?: boolean;
  onNext?: () => void;
  onPrev?: () => void;
  canNext?: boolean;
  canPrev?: boolean;
}

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
    
    const selectedUsers = React.useMemo(() => {
        const arr = Array.isArray(value) ? value : (value ? [value] : []);
        return arr.map(u => {
            if (typeof u === 'object' && u !== null) return u;
            return { id: u, name: 'User ' + u };
        });
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
        let newValue;
        if (exists) {
            newValue = selectedUsers.filter((u: any) => u.id !== user.id);
        } else {
            newValue = [...selectedUsers, { id: user.id, name: user.name, real_name: user.real_name }];
        }
        onChange(newValue);
    };

    return (
        <div 
            className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 shadow-xl rounded-lg z-[100] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
        >
            <div className="p-2 border-b border-gray-100">
                <input 
                    className="w-full text-xs px-2 py-1 bg-gray-50 border border-gray-200 rounded outline-none focus:border-primary-500"
                    placeholder="搜索成员..."
                    value={keyword}
                    onChange={e => setKeyword(e.target.value)}
                    autoFocus
                />
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
        let newValue;
        if (exists) {
            newValue = selectedDepts.filter((d: any) => d.id !== deptId);
        } else {
            newValue = [...selectedDepts, { id: deptId, name: deptName }];
        }
        onChange(newValue);
    };

    return (
        <div 
            className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 shadow-xl rounded-lg z-[110] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
        >
            <div className="p-2 border-b border-gray-100">
                <input 
                    className="w-full text-xs px-2 py-1 bg-gray-50 border border-gray-200 rounded outline-none focus:border-primary-500"
                    placeholder="搜索部门..."
                    value={keyword}
                    onChange={e => setKeyword(e.target.value)}
                    autoFocus
                />
            </div>
            <div className="max-h-60 overflow-y-auto custom-scrollbar py-1">
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
                                <ICONS.Building className={`w-4 h-4 ${isSel ? 'text-primary-600' : 'text-gray-400'}`} />
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

const AutoResizeTextarea = ({ value, onChange, placeholder, className }: any) => {
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);

    const adjustHeight = () => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = '1px';
            textarea.style.height = `${textarea.scrollHeight}px`;
        }
    };

    useEffect(() => {
        adjustHeight();
        const timeoutId = setTimeout(adjustHeight, 300); // For animation completion
        return () => clearTimeout(timeoutId);
    }, [value]);

    useEffect(() => {
        window.addEventListener('resize', adjustHeight);
        return () => window.removeEventListener('resize', adjustHeight);
    }, []);

    return (
        <textarea
            ref={textareaRef}
            className={`${className} break-all whitespace-pre-wrap`}
            placeholder={placeholder}
            value={value}
            onChange={(e) => {
                onChange(e);
                adjustHeight();
            }}
            rows={1}
            style={{ minHeight: '32px' }}
        />
    );
};

const RowDetailPanel: React.FC<RowDetailPanelProps> = ({
  tableId,
  row,
  columns,
  onClose,
  onChange,
  onAddColumn,
  onColumnChange,
  onConfirm,
  isNew,
  onNext,
  onPrev,
  canNext,
  canPrev
}) => {
  const [title, setTitle] = useState('');
  const [activeSelectorFieldId, setActiveSelectorFieldId] = useState<string | null>(null);

  const [previewFile, setPreviewFile] = useState<{ blob: Blob, filename: string } | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  
  const [hoveredField, setHoveredField] = useState<{
      content: string;
      x: number;
      y: number;
  } | null>(null);
  const hoverTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = (e: React.MouseEvent, content: any) => {
      if (!content) return;
      const strContent = String(content);
      if (strContent.trim().length < 10) return; // Only show for relatively long content in detail panel

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      
      hoverTimeoutRef.current = setTimeout(() => {
          setHoveredField({
              content: strContent,
              x: rect.left,
              y: rect.bottom
          });
      }, 500);
  };

  const handleMouseLeave = () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      setHoveredField(null);
  };

  // Find the primary column (usually the first one) for the title
  const primaryCol = columns[0];
  
  useEffect(() => {
      if (row && primaryCol) {
          setTitle(formatFieldValue(row.data[primaryCol.id], primaryCol.type));
      }
  }, [row, primaryCol]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newVal = e.target.value;
      setTitle(newVal);
      onChange(row.id, primaryCol.id, newVal);
  };

  const handlePreview = async (f: any) => {
      try {
          setIsPreviewLoading(true);
          const fileId = typeof f === 'object' ? f.id : f;
          const filename = typeof f === 'object' ? (f.filename || f.name) : f;
          const blob = await api.getFileBlob(fileId);
          setPreviewFile({ blob, filename: filename || '文件' });
      } catch (e: any) {
          console.error('Preview failed:', e);
          toast.error(e.message || '获取文件内容失败');
      } finally {
          setIsPreviewLoading(false);
      }
  };

  const renderFieldInput = (col: Column) => {
      const val = row.data[col.id];

      switch (col.type) {
          case FieldType.TEXT:
              return (
                  <AutoResizeTextarea 
                      className="w-full outline-none bg-transparent text-gray-800 placeholder-gray-400 resize-none overflow-hidden"
                      placeholder="Empty"
                      value={val || ''}
                      onChange={(e: any) => onChange(row.id, col.id, e.target.value)}
                  />
              );
          case FieldType.NUMBER:
              return (
                  <input 
                      type="number" 
                      className="w-full outline-none bg-transparent text-gray-800 placeholder-gray-400"
                      placeholder="Empty"
                      value={val || ''}
                      onChange={(e) => onChange(row.id, col.id, e.target.value)}
                  />
              );
          case FieldType.DATE:
              const includeTime = col.config?.format?.includes('HH') || col.format?.includes('HH');
              return (
                  <div className="flex items-center gap-2 group relative w-full">
                      <input 
                          type={includeTime ? "datetime-local" : "date"}
                          className="w-full outline-none bg-transparent text-gray-800"
                          value={formatDateForInput(val, includeTime)}
                          onChange={(e) => onChange(row.id, col.id, e.target.value)}
                      />
                      {!val && <span className="absolute right-0 text-gray-400 pointer-events-none"><ICONS.Calendar className="w-4 h-4"/></span>}
                  </div>
              );
          case FieldType.TIME:
              const includeSeconds = col.config?.format?.includes('ss');
              return (
                  <div className="flex items-center gap-2 group relative w-full">
                      <input 
                          type="time"
                          step={includeSeconds ? "1" : undefined}
                          className="w-full outline-none bg-transparent text-gray-800"
                          value={val || ''}
                          onChange={(e) => onChange(row.id, col.id, e.target.value)}
                      />
                  </div>
              );
          case FieldType.SELECT:
              return (
                  <Dropdown
                      options={col.config?.options || []}
                      value={val || ''}
                      onChange={(newVal) => onChange(row.id, col.id, newVal)}
                      placeholder="Select..."
                      colorMap={col.config?.option_colors || {}}
                      onColorChange={(option, color) => {
                          if (onColumnChange) {
                              onColumnChange(col.id, {
                                  ...col.config,
                                  option_colors: {
                                      ...(col.config?.option_colors || {}),
                                      [option]: color
                                  }
                              });
                          }
                      }}
                  />
              );
          case FieldType.CHECKBOX:
              return (
                  <input 
                      type="checkbox" 
                      checked={!!val}
                      onChange={(e) => onChange(row.id, col.id, e.target.checked)}
                      className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                  />
              );
          case FieldType.MULTI_SELECT:
              const selectedValues = Array.isArray(val) ? val : (val ? String(val).split(',') : []);
              return (
                  <Dropdown
                      options={col.config?.options || []}
                      value={selectedValues}
                      onChange={(newVal) => onChange(row.id, col.id, newVal)}
                      placeholder="+ Add option..."
                      multiple={true}
                      colorMap={col.config?.option_colors || {}}
                      onColorChange={(option, color) => {
                          if (onColumnChange) {
                              onColumnChange(col.id, {
                                  ...col.config,
                                  option_colors: {
                                      ...(col.config?.option_colors || {}),
                                      [option]: color
                                  }
                              });
                          }
                      }}
                  />
              );
          case FieldType.ATTACHMENT:
              const files = parseJsonArray(val);
              return (
                  <div className="flex flex-col gap-3 w-full">
                      <div className="flex flex-wrap gap-3">
                          {files.map((f: any, i: number) => (
                            <div 
                                key={i} 
                                className="group/file relative w-32 h-24 rounded-lg border border-gray-200 overflow-hidden bg-gray-50 flex items-center justify-center cursor-pointer"
                                onClick={() => handlePreview(f)}
                            >
                                  {f.type?.startsWith('image') || ['jpg','jpeg','png','gif','webp'].includes((f.extension || '').toLowerCase()) ? (
                                      <>
                                          <img src={f.url || api.getFileUrl(f.path)} className="w-full h-full object-cover" alt={f.filename || f.name} onError={(e) => { e.currentTarget.style.display='none'; if(e.currentTarget.nextElementSibling) { e.currentTarget.nextElementSibling.classList.remove('hidden'); e.currentTarget.nextElementSibling.classList.add('flex'); } }} />
                                          <div className="hidden flex-col items-center justify-center text-gray-500 w-full h-full">
                                              <div className="w-10 h-10 bg-primary-50 text-primary-600 flex items-center justify-center rounded-lg font-bold text-[12px] shadow-sm">
                                                  {String(f.extension || (f.filename || f.name)?.split('.').pop() || 'FILE').toUpperCase().substring(0, 4)}
                                              </div>
                                          </div>
                                      </>
                                  ) : (
                                      <div className="flex flex-col items-center justify-center text-gray-500 w-full h-full">
                                          <div className="w-10 h-10 bg-primary-100 text-primary-700 flex items-center justify-center rounded-lg font-bold text-[12px] shadow-sm">
                                              {String(f.extension || (f.filename || f.name)?.split('.').pop() || 'FILE').toUpperCase().substring(0, 4)}
                                          </div>
                                      </div>
                                  )}
                                  
                                  {/* Overlay */}
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/file:opacity-100 transition-opacity flex flex-col justify-between p-2">
                                      <div className="flex justify-between items-start w-full z-10">
                                          <div className="text-[10px] text-white truncate flex-1 mr-2 drop-shadow-md font-medium">{f.filename || f.name}</div>
                                          <button 
                                              onClick={(e) => {
                                                  e.stopPropagation();
                                                  const newFiles = [...files];
                                                  newFiles.splice(i, 1);
                                                  onChange(row.id, col.id, newFiles);
                                              }}
                                              className="text-white/70 hover:text-white transition-colors"
                                          >
                                              <Tooltip content="删除">
                                                  <ICONS.Close className="w-3.5 h-3.5" />
                                              </Tooltip>
                                          </button>
                                      </div>
                                      
                                      <div className="absolute inset-0 flex items-center justify-center gap-3 pointer-events-none">
                                          <button 
                                              onClick={(e) => { e.stopPropagation(); handlePreview(f); }}
                                              className="p-1.5 text-white hover:bg-white/20 rounded-full transition-colors pointer-events-auto"
                                          >
                                              <Tooltip content="预览">
                                                  <ICONS.Eye className="w-5 h-5" />
                                              </Tooltip>
                                          </button>
                                          <button 
                                              onClick={(e) => { e.stopPropagation(); api.downloadFile(f.id, f.filename || f.name); }}
                                              className="p-1.5 text-white hover:bg-white/20 rounded-full transition-colors pointer-events-auto"
                                          >
                                              <Tooltip content="下载">
                                                  <ICONS.Download className="w-5 h-5" />
                                              </Tooltip>
                                          </button>
                                      </div>
                                  </div>
                              </div>
                          ))}
                          
                          {/* Add Button */}
                          <label className="w-32 h-24 rounded-lg border border-dashed border-gray-300 hover:border-primary-400 hover:bg-primary-50/30 flex flex-col items-center justify-center cursor-pointer transition-colors group/add">
                              <div className="w-8 h-8 rounded-full bg-gray-100 group-hover/add:bg-primary-100 flex items-center justify-center text-gray-400 group-hover/add:text-primary-500 mb-2 transition-colors">
                                  <ICONS.Plus className="w-5 h-5" />
                              </div>
                              <span className="text-xs text-gray-500 group-hover/add:text-primary-600">Add file</span>
                              <input 
                                  type="file" 
                                  multiple 
                                  className="hidden" 
                                        onChange={async (e) => {
                                            if (e.target.files && e.target.files.length > 0) {
                                                try {
                                                    const filesToKeep = parseJsonArray(val);
                                                    const newFiles = [];
                                                    for (const file of Array.from(e.target.files) as File[]) {
                                                        const res = await api.uploadFile(file);
                                                        if (res.data) {
                                                            newFiles.push(res.data);
                                                        }
                                                    }
                                                    onChange(row.id, col.id, [...filesToKeep, ...newFiles]);
                                                } catch (err) {
                                                    console.error('Upload failed', err);
                                                }
                                            }
                                        }}
                           />
                          </label>
                      </div>
                  </div>
              );
          case FieldType.USER:
              return (
                  <div className="relative">
                      <div 
                          className="min-h-[32px] flex items-center cursor-pointer hover:bg-gray-100/50 rounded px-1 transition-colors"
                          onClick={() => setActiveSelectorFieldId(activeSelectorFieldId === col.id ? null : col.id)}
                      >
                          <UserCellDisplay 
                              tableId={tableId}
                              rowId={row.id}
                              colId={col.id}
                              value={val}
                              onDelete={(index) => {
                                  const newValue = Array.isArray(val) ? val.filter((_, i) => i !== index) : [];
                                  onChange(row.id, col.id, newValue);
                              }}
                          />
                      </div>
                      {activeSelectorFieldId === col.id && (
                        <ClickOutsideWrapper onClickOutside={() => setActiveSelectorFieldId(null)}>
                          <UserSelector 
                              value={val} 
                              onChange={(newVal) => onChange(row.id, col.id, newVal)}
                              onClose={() => setActiveSelectorFieldId(null)}
                          />
                        </ClickOutsideWrapper>
                      )}
                  </div>
              );
          case FieldType.DEPARTMENT:
              const depts = Array.isArray(val) ? val : (val ? [val] : []);
              return (
                  <div className="relative">
                      <div 
                          className="min-h-[32px] flex items-center cursor-pointer hover:bg-gray-100/50 rounded px-1 transition-colors gap-1 flex-wrap"
                          onClick={() => setActiveSelectorFieldId(activeSelectorFieldId === col.id ? null : col.id)}
                      >
                          {depts.map((d: any, i: number) => (
                              <div key={i} className="flex items-center gap-1 bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded text-[10px] border border-gray-200 shrink-0">
                                  <ICONS.Building className="w-3 h-3 text-gray-500" />
                                  <span className="truncate max-w-[200px]">{d.name || d.dept_name}</span>
                              </div>
                          ))}
                          {depts.length === 0 && <span className="text-gray-300 text-xs">选择部门</span>}
                      </div>
                      {activeSelectorFieldId === col.id && (
                        <ClickOutsideWrapper onClickOutside={() => setActiveSelectorFieldId(null)}>
                          <DepartmentSelector 
                              value={val} 
                              onChange={(newVal) => onChange(row.id, col.id, newVal)}
                              onClose={() => setActiveSelectorFieldId(null)}
                          />
                        </ClickOutsideWrapper>
                      )}
                  </div>
              );
          case FieldType.FORMULA:
          case FieldType.LOOKUP:
          case FieldType.SEARCH_REFERENCE:
              // Calculate formula value or display derived values
              let displayVal = val;
              
              if (col.type === FieldType.FORMULA) {
                  const formula = col.config?.formula;
                  displayVal = evaluateFormula(formula || '', columns, row);
              } else if (col.type === FieldType.SEARCH_REFERENCE || col.type === FieldType.LOOKUP) {
                  displayVal = Array.isArray(val) ? val.map(v => typeof v === 'object' ? (v.name || v.id) : String(v)).join(', ') : String(val || '');
              }

              return (
                  <div className="text-sm text-gray-800 w-full py-1 font-mono bg-gray-50 px-2 rounded border border-gray-100 min-h-[32px] break-words whitespace-pre-wrap flex items-center">
                      <span className="w-full break-words whitespace-pre-wrap block leading-relaxed">{String(displayVal !== undefined && displayVal !== null ? displayVal : '')}</span>
                  </div>
              );
          case FieldType.LINK:
              const links = parseLinkValues(val);
              return (
                  <LinkFieldDisplay 
                      sourceTableId={tableId}
                      sourceRowId={row.id}
                      sourceColId={col.id}
                      linkedTableId={col.config?.linked_table_id || ''} 
                      initialRecords={links} 
                      onChange={onChange}
                  />
              );
          case FieldType.HYPERLINK:
              return (
                  <div className="flex items-center gap-2 w-full">
                      <AutoResizeTextarea 
                          className="flex-1 outline-none bg-transparent text-gray-800 placeholder-gray-400 resize-none overflow-hidden"
                          value={val || ''}
                          onChange={(e: any) => onChange(row.id, col.id, e.target.value)}
                      />
                      {val && (
                          <button 
                              onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(String(val).startsWith('http') ? String(val) : `https://${val}`, '_blank');
                              }}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded border border-transparent hover:border-blue-200 transition-colors shrink-0"
                          >
                              <Tooltip content="打开链接">
                                  <ICONS.Link className="w-4 h-4" />
                              </Tooltip>
                          </button>
                      )}
                  </div>
              );
          default:
              return (
                  <AutoResizeTextarea 
                      className="w-full outline-none bg-transparent text-gray-800 placeholder-gray-400 resize-none overflow-hidden"
                      value={val || ''}
                      onChange={(e: any) => onChange(row.id, col.id, e.target.value)}
                  />
              );
      }
  };

  return (
    <div className="fixed inset-0 z-[100] flex justify-end bg-black/20" onClick={onClose}>
      <motion.div 
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="w-full sm:w-[500px] md:w-[600px] lg:w-[700px] xl:w-[800px] bg-white h-full shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-14 border-b border-gray-100 flex items-center justify-between px-6 shrink-0">
            <div className="flex items-center gap-2 text-gray-400">
                <Tooltip content="收起">
                    <button onClick={onClose} className="hover:text-gray-600"><ICONS.ChevronsRight className="w-5 h-5" /></button>
                </Tooltip>
                {!isNew && (
                    <>
                        <div className="h-4 w-px bg-gray-200 mx-1"></div>
                        <Tooltip content="上一条">
                            <button 
                                onClick={onPrev} 
                                disabled={!canPrev}
                                className={`flex items-center justify-center p-1 rounded transition-colors ${canPrev ? 'hover:bg-gray-100 text-gray-500 hover:text-gray-800' : 'text-gray-300 cursor-not-allowed'}`}
                            >
                                <span className="font-bold text-lg leading-none" style={{ fontFamily: 'system-ui, sans-serif' }}>↑</span>
                            </button>
                        </Tooltip>
                        <Tooltip content="下一条">
                            <button 
                                onClick={onNext} 
                                disabled={!canNext}
                                className={`flex items-center justify-center p-1 rounded transition-colors ${canNext ? 'hover:bg-gray-100 text-gray-500 hover:text-gray-800' : 'text-gray-300 cursor-not-allowed'}`}
                            >
                                <span className="font-bold text-lg leading-none" style={{ fontFamily: 'system-ui, sans-serif' }}>↓</span>
                            </button>
                        </Tooltip>
                    </>
                )}
            </div>
            
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
            <div className="px-8 py-6">
                {/* Title Input */}
                <div className="mb-6 relative group/title">
                    <input 
                        type="text" 
                        className="text-3xl font-bold text-gray-900 w-full outline-none placeholder-gray-300 truncate"
                        placeholder="Untitled"
                        value={title}
                        onChange={handleTitleChange}
                        readOnly={true}
                        onMouseEnter={(e) => handleMouseEnter(e, title)}
                        onMouseLeave={handleMouseLeave}
                    />
                </div>

                {/* Fields List */}
                <div className="space-y-1">
                    {columns.map(col => {
                        return (
                            <div key={col.id} className="group flex items-start py-2 min-h-[40px]">
                                {/* Label */}
                                <div className="w-32 sm:w-44 flex items-center gap-2 text-gray-500 text-sm shrink-0 pt-1">
                                    <span className="text-gray-400">{FIELD_TYPE_ICONS[col.type]}</span>
                                    <Tooltip content={col.name} className="truncate select-none">
                                        <span>{col.name}</span>
                                    </Tooltip>
                                </div>
                                
                                {/* Input Area */}
                                <div className="flex-1 min-w-0 text-sm pt-1 hover:bg-gray-50 rounded px-2 -mx-2 transition-colors">
                                    {renderFieldInput(col)}
                                </div>
                            </div>
                        );
                    })}
                    
                    {/* Add Field Button */}
                    {!isNew && (
                        <div 
                            className="flex items-center gap-2 text-gray-400 hover:text-primary-600 cursor-pointer py-3 mt-4 text-sm"
                            onClick={onAddColumn}
                        >
                            <ICONS.Plus className="w-4 h-4" />
                            <span>新增字段</span>
                        </div>
                    )}

                    {/* Sub-records Section (if any) */}
                    {!isNew && row.children && row.children.length > 0 && (
                        <div className="mt-8 pt-6 border-t border-gray-100">
                            <div className="flex items-center gap-2 text-gray-500 mb-4">
                                <ICONS.Branch className="w-4 h-4" />
                                <span className="font-medium">子记录 ({row.children.length})</span>
                            </div>
                            <div className="space-y-2 pl-6 border-l border-gray-200 ml-2">
                                {row.children.map(child => (
                                    <div key={child.id} className="text-sm text-gray-700 py-1">
                                        {child.data[primaryCol.id] || 'Untitled'}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>

        {/* Footer for New Record */}
        {isNew && (
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3 bg-gray-50">
                <button 
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                >
                    取消
                </button>
                <button 
                    onClick={onConfirm}
                    className="px-6 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg shadow-sm transition-colors"
                >
                    提交
                </button>
            </div>
        )}
      </motion.div>

      {/* Hover Tooltip Portal */}
      {hoveredField && createPortal(
          <div 
             className="fixed z-[300] max-w-[400px] max-h-[300px] overflow-y-auto bg-black text-white text-xs px-3 py-2 rounded shadow-xl pointer-events-none break-words leading-relaxed whitespace-pre-wrap"
             style={{ 
                 top: Math.min(hoveredField.y + 8, window.innerHeight - 100), 
                 left: Math.min(hoveredField.x, window.innerWidth - 410) 
             }}
          >
              {hoveredField.content}
          </div>,
          document.body
      )}

      {/* File Preview Modal */}
      <AnimatePresence>
        {previewFile && (
          <FilePreviewModal 
              isOpen={true}
              fileBlob={previewFile.blob}
              filename={previewFile.filename}
              onClose={() => setPreviewFile(null)}
          />
        )}
      </AnimatePresence>
      
      {/* Loading Overlay */}
      {isPreviewLoading && (
          <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center">
              <div className="bg-white rounded-lg p-4 flex items-center gap-3 shadow-xl">
                  <div className="w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-sm font-medium text-gray-700">加载预览中...</span>
              </div>
          </div>
      )}
    </div>
  );
};

export default RowDetailPanel;
