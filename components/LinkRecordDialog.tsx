import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import { Row, Column, FieldType } from '../types';
import { ICONS, getTagColor, formatDateForDisplay, parseLinkValues, formatFieldValue, parseJsonArray } from '../constants';
import { Tooltip } from './Tooltip';
import { Select } from './Select';
import { UserCellDisplay } from './UserCellDisplay';

const CheckboxUnchecked = () => (
  <div className="w-4 h-4 border border-gray-300 rounded bg-white" />
);

const CheckboxChecked = () => (
  <div className="w-4 h-4 bg-primary-500 border border-primary-500 rounded flex items-center justify-center">
    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
    </svg>
  </div>
);

interface LinkRecordDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedRows: Row[], columns: Column[]) => void;
  targetTableId: string;
  sourceTableId?: string;
  sourceRowId?: string;
  sourceColId?: string;
  initialSelectedValues?: { id: string, name: string }[];
  title?: string;
}

const LinkRecordDialog: React.FC<LinkRecordDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  targetTableId,
  sourceTableId,
  sourceRowId,
  sourceColId,
  initialSelectedValues = [],
  title = '关联记录'
}) => {
  const [rows, setRows] = useState<Row[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedRowsMap, setSelectedRowsMap] = useState<Map<string, Row | { id: string, name: string }>>(new Map());
  const [targetTableName, setTargetTableName] = useState('');
  const [viewMode, setViewMode] = useState<'ALL' | 'SELECTED'>('ALL');

  useEffect(() => {
    if (isOpen && targetTableId) {
      // Initialize selected map from props
      const initialMap = new Map<string, Row | { id: string, name: string }>();
      const initialSet = new Set<string>();
      
      initialSelectedValues.forEach(v => {
          if (v && v.id) {
              initialMap.set(String(v.id), v);
              initialSet.add(String(v.id));
          }
      });
      
      setSelectedRowsMap(initialMap);
      setSelectedIds(initialSet);
      
      fetchData();
    }
  }, [isOpen, targetTableId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Get Table Detail for Columns if not loaded
      if (columns.length === 0) {
          const tableRes = await api.getTableDetail(targetTableId);
          if (tableRes.data) {
            setColumns(tableRes.data.columns || []);
            setTargetTableName(tableRes.data.name);
          }
      }

      // 2. Fetch specific linked cell row ids if available (overwrite selectedIds with source of truth)
      let fetchedCellLinkIds: string[] | null = null;
      if (sourceTableId && sourceRowId && String(sourceRowId) !== 'new' && !String(sourceRowId).startsWith('new_') && sourceRowId !== 'undefined' && sourceColId && !keyword) { // only run this when no search occurs initially
          try {
              const cellLinkRes: any = await api.getCellLink(sourceTableId, sourceRowId, sourceColId);
              const rowIds = cellLinkRes?.data?.row_ids || cellLinkRes?.row_ids;
              if (Array.isArray(rowIds)) {
                 fetchedCellLinkIds = rowIds.map(String);
              }
          } catch(err) {
              console.error("Failed to load specific cell linked rows", err);
              // Handle 401/auth internally if your api service is set up, or display message.
          }
      }

      // 3. Get Rows
      const rowsRes = await api.getRows(targetTableId, { page: 1, page_size: 100, search: keyword });
      if (rowsRes.data && Array.isArray(rowsRes.data.list)) {
        setRows(rowsRes.data.list);
        
        // Ensure any rows we just fetched that correspond to selectedIds are stored as full row objects.
        setSelectedIds(prevIds => {
            const nextIds = fetchedCellLinkIds ? new Set(fetchedCellLinkIds) : new Set(prevIds);
            
            setSelectedRowsMap(prevMap => {
                const newMap = new Map();
                // Keep entries that are in nextIds so we don't lose data across pages/searches
                nextIds.forEach(id => {
                    if (prevMap.has(id)) {
                        newMap.set(id, prevMap.get(id));
                    } else {
                        // Create a dummy object if missing to ensure we have something to save
                        newMap.set(id, { id: id, name: id });
                    }
                });
                
                // Upgrade fetched rows into the map
                rowsRes.data.list.forEach((r: Row) => {
                    if (nextIds.has(String(r.id))) {
                        newMap.set(String(r.id), r);
                    }
                });
                return newMap;
            });
            
            return nextIds;
        });
      }
    } catch (err: any) {
      console.error('Failed to fetch link records', err);
      // Optional basic 401 handling if api interceptor missing
      if (err instanceof TypeError || (err.message && err.message.includes('401'))) {
          alert('需要认证或Token已过期，请配置或重新登录。');
      }
    } finally {
      setLoading(false);
    }
  };

  // Debounce search
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      fetchData();
    }, 300);
    return () => clearTimeout(timer);
  }, [keyword]);

  const handleToggleRow = (row: Row | { id: string, name: string }) => {
    const rowId = String(row.id);
    
    setSelectedIds(prevSet => {
        const hasIt = prevSet.has(rowId);
        const newSet = new Set(prevSet);
        
        if (hasIt) newSet.delete(rowId);
        else newSet.add(rowId);

        setSelectedRowsMap(prevMap => {
            const newMap = new Map(prevMap);
            if (hasIt) newMap.delete(rowId);
            else newMap.set(rowId, row);
            return newMap;
        });
        
        return newSet;
    });
  };

  const handleConfirm = () => {
    // Convert map values to array
    const selectedRows = Array.from(selectedRowsMap.values()) as Row[];
    onConfirm(selectedRows, columns);
    onClose();
  };

  if (!isOpen) return null;

  // Show all columns instead of slicing
  const displayColumns = columns;

  // Determine which rows to show based on viewMode
  let displayRows = rows;
  if (viewMode === 'SELECTED') {
      // Show rows from the map
      // Note: These might be partial objects {id, name} if they came from initialValues and weren't fetched
      displayRows = Array.from(selectedRowsMap.values()) as Row[];
      
      // Filter by keyword if needed (client-side search for selected items)
      if (keyword) {
          const lowerKeyword = keyword.toLowerCase();
          displayRows = displayRows.filter(r => {
              // Search in all columns we have data for
              if ('data' in r && r.data) {
                  return Object.values(r.data).some(v => String(v).toLowerCase().includes(lowerKeyword));
              } else if ('name' in r) {
                  return String((r as any).name).toLowerCase().includes(lowerKeyword);
              }
              return false;
          });
      }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              {title}
              <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                {targetTableName}
              </span>
            </h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
            <ICONS.Close className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-6 py-3 border-b border-gray-100 flex gap-3">
          <div className="relative flex-1">
            <ICONS.Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input 
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="请输入关键词搜索"
              className="w-full pl-9 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none transition-all"
            />
            {keyword && (
                <button 
                    onClick={() => setKeyword('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                    <ICONS.Close className="w-4 h-4" />
                </button>
            )}
          </div>
          <div className="w-36 shrink-0">
             <Select 
                options={[
                    { label: '所有记录', value: 'ALL' },
                    { label: `已选记录 (${selectedIds.size})`, value: 'SELECTED' }
                ]}
                value={viewMode}
                onChange={(val) => setViewMode(val as 'ALL' | 'SELECTED')}
                triggerClassName="w-full bg-white border border-gray-200 text-gray-700 py-2 px-3 rounded-lg text-sm focus:outline-none focus:border-primary-500 cursor-pointer hover:bg-gray-50 transition-colors"
             />
          </div>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-auto">
          {loading && viewMode === 'ALL' && rows.length === 0 ? (
             <div className="flex items-center justify-center h-full text-gray-400 gap-2">
                 <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                 加载中...
             </div>
          ) : (
            <div className="min-w-max">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50 sticky top-0 z-10 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3 border-b border-gray-200 w-12 text-center sticky left-0 bg-gray-50 z-20">
                      {/* Select All Checkbox could go here */}
                    </th>
                    {displayColumns.map(col => (
                      <th key={col.id} className="px-4 py-3 border-b border-gray-200 truncate max-w-[200px] min-w-[120px]">
                        <div className="flex items-center gap-1">
                          {/* Icon for field type */}
                          {col.name}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {displayRows.map(row => {
                    const isSelected = selectedIds.has(String(row.id));
                    // Handle partial row objects (from initialValues)
                    const isPartial = !('data' in row);
                    const rowData = isPartial ? {} : (row as Row).data;
                    const rowName = isPartial ? (row as any).name : '';
  
                    return (
                      <tr 
                          key={row.id} 
                          className={`hover:bg-gray-50 transition-colors cursor-pointer ${isSelected ? 'bg-primary-50/50' : ''}`}
                          onClick={() => handleToggleRow(row)}
                      >
                        <td className="px-4 py-3 text-center sticky left-0 bg-white z-10 group-hover:bg-gray-50">
                          <input 
                            type="checkbox" 
                            checked={isSelected}
                            onChange={(e) => {
                                e.stopPropagation();
                                handleToggleRow(row);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500 cursor-pointer"
                          />
                        </td>
                        {displayColumns.map((col, idx) => {
                          let renderContent: React.ReactNode = null;
                          
                          if (isPartial && idx === 0) {
                              renderContent = <span className="text-sm">{rowName}</span>;
                          } else {
                              const val = rowData[col.id];
                              
                              if (col.type === FieldType.SELECT || col.type === FieldType.MULTI_SELECT) {
                                  const values = Array.isArray(val) ? val : (val ? String(val).split(',') : []);
                                  renderContent = (
                                      <div className="flex flex-wrap gap-1 items-center">
                                          {values.length > 0 ? values.map((v: string, i: number) => {
                                              const colorStyle = getTagColor(v, col.config?.option_colors);
                                              return (
                                                  <span key={i} className={`px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap ${colorStyle.bg} ${colorStyle.text}`}>
                                                      {v}
                                                  </span>
                                              );
                                          }) : <span className="text-gray-300 text-xs"></span>}
                                      </div>
                                  );
                              } else if (col.type === FieldType.CHECKBOX) {
                                  renderContent = val ? <CheckboxChecked /> : <CheckboxUnchecked />;
                              } else if (col.type === FieldType.USER) {
                                  renderContent = (
                                      <div className="flex flex-wrap gap-1">
                                            <UserCellDisplay tableId={targetTableId} rowId={row.id} colId={col.id} value={val} />
                                      </div>
                                  );
                              } else if (col.type === FieldType.ATTACHMENT) {
                                  const files = parseJsonArray(val);
                                  renderContent = (
                                      <div className="flex items-center gap-1 overflow-hidden">
                                          {files.map((f: any, i: number) => (
                                              <Tooltip 
                                                  key={i} 
                                                  className="flex items-center justify-center w-5 h-5 bg-primary-50 text-primary-600 rounded shrink-0 border border-primary-100"
                                                  content={f.filename || f.name}
                                              >
                                                  <span className="text-[8px] font-bold uppercase">{String(f.extension || f.name?.split('.').pop() || 'F').substring(0, 3)}</span>
                                              </Tooltip>
                                          ))}
                                      </div>
                                  );
                              } else if (col.type === FieldType.LINK) {
                                  const links = parseLinkValues(val);
                                  renderContent = (
                                      <span className="text-sm truncate">
                                          {links.map((link: any) => link.name || (typeof link === 'object' ? link.id : String(link))).join(', ')}
                                      </span>
                                  );
                              } else if (col.type === FieldType.HYPERLINK) {
                                  renderContent = val ? (
                                      <span className="text-blue-600 underline truncate">{String(val)}</span>
                                  ) : null;
                              } else if (col.type === FieldType.DATE) {
                                  renderContent = <span className="text-sm">{formatDateForDisplay(val)}</span>;
                              } else if (col.type === FieldType.DEPARTMENT) {
                                  const depts = Array.isArray(val) ? val : (val ? [val] : []);
                                  renderContent = (
                                     <div className="flex flex-wrap gap-1">
                                        {depts.map((d: any, i: number) => (
                                           <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-orange-50 text-orange-700 border border-orange-100">
                                              <ICONS.Group className="w-3 h-3 mr-1" />
                                              {typeof d === 'object' ? d.name || '' : String(d)}
                                           </span>
                                        ))}
                                     </div>
                                  )
                              } else {
                                  renderContent = <span className="text-sm block w-full truncate">{String(val || '')}</span>;
                              }
                          }
  
                          return (
                            <td key={col.id} className="px-4 py-2 text-sm text-gray-700 max-w-[200px] min-w-[120px]">
                              {renderContent}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  {displayRows.length === 0 && !loading && (
                      <tr>
                          <td colSpan={displayColumns.length + 1} className="px-4 py-8 text-center text-gray-400 text-sm">
                              {viewMode === 'SELECTED' ? '暂无已选记录' : '暂无数据'}
                          </td>
                      </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center bg-gray-50 rounded-b-xl">
          <div className="flex items-center gap-4">
             <button className="flex items-center gap-1 text-gray-600 hover:text-primary-600 text-sm font-medium px-3 py-1.5 border border-gray-300 rounded bg-white hover:bg-gray-50 transition-colors">
                 <ICONS.Plus className="w-4 h-4" /> 添加记录
             </button>
             <span className="text-sm text-gray-500">
                 已选: <span className="font-bold text-primary-600">{selectedIds.size}</span> 条记录
             </span>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={onClose}
              className="px-5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
            >
              取消
            </button>
            <button 
              onClick={handleConfirm}
              className="px-6 py-2 text-sm font-bold bg-primary-600 text-white rounded-lg hover:bg-primary-700 shadow-md transition-colors"
            >
              确认
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LinkRecordDialog;
