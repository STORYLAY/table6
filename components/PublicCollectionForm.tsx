'use client';

import React, { useState, useEffect } from 'react';
import { Column, FieldType, CollectionFormConfig } from '../types';
import { ICONS, FIELD_TYPE_ICONS } from '../constants';
import { api } from '../services/api';
import { UserSelector } from './UserSelector';
import { Dropdown } from './Dropdown';
import { ClickOutsideWrapper } from './ClickOutsideWrapper';
import { Toaster, toast } from 'sonner';

interface PublicCollectionFormProps {
  shareCode?: string;
}

export const PublicCollectionForm: React.FC<PublicCollectionFormProps> = ({ shareCode }) => {
  const [loading, setLoading] = useState(true);
  const [formTitle, setFormTitle] = useState('请输入表单标题');
  const [formDescription, setFormDescription] = useState('添加描述：文字、图片或链接');
  const [formFields, setFormFields] = useState<Column[]>([]);
  const [requiredFields, setRequiredFields] = useState<Record<string, boolean>>({});
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [activeSelectorId, setActiveSelectorId] = useState<string | null>(null);
  const [submitMessage, setSubmitMessage] = useState('提交成功');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

  // Determine active share code (prop is prioritized, fallback to URL search param)
  const queryParams = new URLSearchParams(window.location.search);
  const activeShareCode = shareCode || queryParams.get('share_code') || '';

  useEffect(() => {
    // Override the body's overflow-hidden class to support full scrolling on smartphones and desktops
    const bodyClass = document.body.className;
    document.body.classList.remove('overflow-hidden');
    document.body.classList.add('overflow-y-auto');
    return () => {
      document.body.className = bodyClass;
    };
  }, []);

  useEffect(() => {
    const loadPublicConfig = async () => {
      setLoading(true);
      try {
        const [res, columnsRes] = await Promise.all([
          api.getPublicCollectionForm(activeShareCode),
          api.getPublicCollectionFormColumns(activeShareCode).catch(e => {
            console.error("Failed to fetch public form columns dynamically", e);
            return null;
          })
        ]);

        if (res && res.data) {
          const config = res.data;
          console.log("DEBUG: config loaded", config);
          setFormTitle(config.title || '标题');
          setFormDescription(config.description || '');

          let parsedFormConfig: any = {};
          if (config.form_config) {
            if (typeof config.form_config === 'string') {
              try {
                parsedFormConfig = JSON.parse(config.form_config);
              } catch (e) {
                console.error("Failed to parse public form_config string", e);
              }
            } else if (typeof config.form_config === 'object') {
              parsedFormConfig = config.form_config;
            }
          }

          if (parsedFormConfig?.submit_message) {
            setSubmitMessage(parsedFormConfig.submit_message);
          }

          // Build a lookup map of dynamically fetched latest columns
          const columnMap = new Map<string, any>();
          if (columnsRes && columnsRes.data) {
            columnsRes.data.forEach((col: any) => {
              columnMap.set(col.id, col);
            });
          }

          // Map field mapping columns
          const mappings = config.field_mappings || [];
          const sortedMappings = [...mappings].sort((a, b) => (a.order || 0) - (b.order || 0));

          const fields: Column[] = [];
          const reqs: Record<string, boolean> = {};

          sortedMappings.forEach(mapping => {
            const colId = mapping.column_id || mapping.form_field_id;
            const dynamicCol = columnMap.get(colId);

            let formConfig = {};
            try {
              const rawFormConfig = mapping.form_field_config || mapping.column_config || (mapping as any).config;
              if (rawFormConfig && typeof rawFormConfig === 'string') {
                formConfig = JSON.parse(rawFormConfig);
              } else if (rawFormConfig && typeof rawFormConfig === 'object') {
                formConfig = rawFormConfig;
              }
            } catch (e) {
              console.error("Failed to parse field mapping config:", e);
            }

            let baseConfig = {};
            if (dynamicCol?.config) {
              if (typeof dynamicCol.config === 'string') {
                try {
                  baseConfig = JSON.parse(dynamicCol.config);
                } catch (e) {}
              } else {
                baseConfig = dynamicCol.config;
              }
            }

            const mappedConfig: any = { ...baseConfig, ...formConfig };

            let displayStyle = 'chips';
            if (mappedConfig.form_display_style) {
              console.log("DEBUG: Setting display style from mappedConfig:", colId, mappedConfig.form_display_style);
              displayStyle = mappedConfig.form_display_style;
            } else if ((formConfig as any)?.form_display_style) {
              console.log("DEBUG: Setting display style from formConfig:", colId, (formConfig as any).form_display_style);
              displayStyle = (formConfig as any).form_display_style;
            } else if (parsedFormConfig?.field_display_styles) {
              const styles = parsedFormConfig.field_display_styles;
              const styleVal = styles[colId] || styles[mapping.column_id] || styles[mapping.form_field_id];
              if (styleVal) {
                console.log("DEBUG: Setting display style from form_config mapping:", colId, styleVal);
                displayStyle = styleVal;
              }
            }
            mappedConfig.form_display_style = displayStyle;
            console.log("DEBUG: final mappedConfig", colId, mappedConfig);

            fields.push({
              id: colId,
              name: mapping.form_field_name || dynamicCol?.name || '',
              type: (mapping.column_type || dynamicCol?.type) as FieldType || FieldType.TEXT,
              config: mappedConfig,
            } as Column);
            reqs[colId] = !!mapping.is_required;
          });

          setFormFields(fields);
          setRequiredFields(reqs);
        } else {
          setErrorMessage("表单配置未找到，请核对分享链接。");
        }
      } catch (err: any) {
        console.error("Failed to load public form configuration", err);
        setErrorMessage(err.message || "加载表单失败，请检查分享码。");
      } finally {
        setLoading(false);
      }
    };

    if (activeShareCode) {
      loadPublicConfig();
    } else {
      setErrorMessage("请检查链接，分享码（share_code）不能为空");
      setLoading(false);
    }
  }, [activeShareCode]);

  const handleSubmitForm = async () => {
    for (const field of formFields) {
      if (requiredFields[field.id]) {
        const val = formData[field.id];
        if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) {
          toast.warning(`请填写/选择：${field.name}`);
          return;
        }
      }
    }
    setIsConfirmModalOpen(true);
  };

  const executeSubmit = async () => {
    try {
      setLoading(true);
      const payload: Record<string, any> = {};
      formFields.forEach(field => {
        const val = formData[field.id];
        if (val !== undefined && val !== null && val !== '') {
          if (field.type === FieldType.USER || field.type === FieldType.DEPARTMENT || field.type === FieldType.GROUP) {
            if (Array.isArray(val)) {
              payload[field.id] = val.map((item: any) => {
                if (typeof item === 'object' && item !== null) {
                  return item.id;
                }
                return item;
              });
            } else if (typeof val === 'object' && val !== null) {
              payload[field.id] = [val.id];
            } else {
              payload[field.id] = [val];
            }
          } else {
            payload[field.id] = val;
          }
        }
      });

      await api.submitCollectionForm(activeShareCode, payload);
      setIsSubmitted(true);
      setFormData({});
    } catch (err: any) {
      console.error(err);
      toast.error(`提交失败: ${err.message || "未知错误"}`);
    } finally {
      setLoading(false);
    }
  };

  if (errorMessage) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 max-w-md w-full text-center">
          <svg className="w-16 h-16 text-red-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h2 className="text-xl font-bold text-gray-900 mb-2">获取表单失败</h2>
          <p className="text-gray-500 text-sm mb-6">{errorMessage}</p>
        </div>
      </div>
    );
  }

  if (loading && formFields.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#f3f5f7]">
        <div className="flex flex-col items-center gap-3">
          <svg className="animate-spin h-8 w-8 text-primary-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-gray-500 text-sm">正在加载公开收集表配置...</p>
        </div>
      </div>
    );
  }

  if (isSubmitted) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#f3f5f7] p-4">
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 max-w-md w-full text-center py-12">
          <div className="bg-[#eefcf7] w-16 h-16 rounded-full flex items-center justify-center mb-6 mx-auto animate-bounce">
            <svg className="w-8 h-8 text-[#10b981]" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-950 mb-3">{submitMessage || "提交成功"}</h2>
          <p className="text-gray-500 text-sm mb-8">数据已成功同步至多维表格中。</p>
          <button 
            onClick={() => setIsSubmitted(false)}
            className="w-full bg-[#f4f6fa] hover:bg-gray-200 text-gray-700 font-semibold py-3 rounded-xl text-[14px] transition-colors shadow-sm"
          >
            再次填写
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f3f5f7] pb-32">
      <Toaster position="top-right" richColors />
      {isConfirmModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-primary-50 flex items-center justify-center text-primary-600 shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900">确认提交吗？</h3>
            </div>
            <p className="text-gray-500 text-[14px] leading-relaxed mb-6">
              请确认您填写的信息无误，点击确定后您的数据将提交并保存至多维表格中。
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                className="px-4 py-2 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg text-sm font-medium transition-colors cursor-pointer select-none"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsConfirmModalOpen(false);
                  executeSubmit();
                }}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm cursor-pointer select-none"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-8">
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 overflow-hidden mb-6">
            <h1 className="text-[28px] font-bold text-gray-900 mb-3">{formTitle}</h1>
            <p className="text-gray-500 text-[14px] whitespace-pre-wrap">{formDescription}</p>
          </div>

          {formFields.map((field, index) => (
            <div key={field.id} className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col relative w-full">
              <div className="p-6">
                <div className="font-bold text-gray-900 mb-4 text-[13px] flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span>
                      {requiredFields[field.id] && <span className="text-red-500 mr-1">*</span>}
                      {String(index + 1).padStart(2, '0')} {field.name}
                    </span>
                  </div>
                </div>

                {field.type === FieldType.TEXT && (
                  <textarea 
                    rows={1}
                    value={formData[field.id] || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, [field.id]: e.target.value }))}
                    className="w-full border border-gray-200 rounded p-2.5 text-[14px] text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 min-h-[40px] resize-none" 
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = 'auto';
                      target.style.height = target.scrollHeight + 'px';
                    }}
                  />
                )}

                {field.type === FieldType.NUMBER && (
                  <input 
                    type="number"
                    value={formData[field.id] || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, [field.id]: e.target.value }))}
                    className="w-full border border-gray-200 rounded p-2.5 text-[14px] text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500" 
                  />
                )}

                {(field.type === FieldType.SELECT || field.type === FieldType.MULTI_SELECT) && (
                  <div className="w-full">
                    <Dropdown
                      options={field.config?.options || []}
                      value={formData[field.id] || (field.type === FieldType.MULTI_SELECT ? [] : '')}
                      onChange={(val) => setFormData(prev => ({ ...prev, [field.id]: val }))}
                      multiple={field.type === FieldType.MULTI_SELECT}
                      placeholder={`请选择${field.name}`}
                      colorMap={field.config?.optionColors || field.config?.option_colors}
                    />
                  </div>
                )}

                {field.type === FieldType.DATE && (
                  <input 
                    type="date"
                    value={formData[field.id] || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, [field.id]: e.target.value }))}
                    className="w-full border border-gray-200 rounded p-2.5 text-[14px] text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 max-w-[200px]" 
                  />
                )}

                {field.type === FieldType.TIME && (
                  <input 
                    type="time"
                    step={field.config?.format?.includes('ss') ? "1" : undefined}
                    value={formData[field.id] || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, [field.id]: e.target.value }))}
                    className="w-full border border-gray-200 rounded p-2.5 text-[14px] text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 max-w-[200px]" 
                  />
                )}

                {field.type === FieldType.CHECKBOX && (
                  <div className="flex items-center">
                    <input 
                      type="checkbox" 
                      checked={!!formData[field.id]}
                      onChange={(e) => setFormData(prev => ({ ...prev, [field.id]: e.target.checked }))}
                      className="w-4 h-4 mr-2 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer bg-white" 
                    />
                    <span className="text-[14px] text-gray-700">选项</span>
                  </div>
                )}

                {field.type === FieldType.ATTACHMENT && (
                  <div className="w-full">
                    <label className="w-full border border-dashed border-gray-200 rounded py-6 flex flex-col items-center justify-center bg-gray-50 text-gray-500 cursor-pointer hover:bg-gray-100 transition-colors mb-4">
                      <input 
                        type="file" 
                        className="hidden" 
                        multiple
                        onChange={async (e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            const filesArray = Array.from(e.target.files) as File[];
                            const uploadPromises = filesArray.map((file: File) => api.uploadFile(file));
                            try {
                              const results = await Promise.all(uploadPromises);
                              const uploadedFiles = results.map((res: any, idx: number) => res.data || { name: filesArray[idx].name, filename: filesArray[idx].name, url: URL.createObjectURL(filesArray[idx]) });
                              setFormData(prev => ({ ...prev, [field.id]: [...(prev[field.id] || []), ...uploadedFiles] }));
                            } catch (error) {
                              console.error("Upload failed", error);
                              const fallbackFiles = filesArray.map((f: File) => ({ name: f.name, filename: f.name, url: URL.createObjectURL(f) }));
                              setFormData(prev => ({ ...prev, [field.id]: [...(prev[field.id] || []), ...fallbackFiles] }));
                            }
                          }
                        }}
                      />
                      <svg className="w-5 h-5 mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                      <span className="text-[13px] font-medium">点击或拖拽文件到这里</span>
                    </label>

                    {(formData[field.id] || []).length > 0 && (
                      <div className="space-y-2 mt-4">
                        {(formData[field.id] || []).map((file: any, i: number) => (
                          <div key={i} className="flex items-center justify-between p-2.5 border border-gray-100 rounded bg-white font-sans text-xs">
                            <div className="flex items-center gap-3 overflow-hidden">
                              <span className="text-[13px] text-gray-700 truncate">{file.name || file.filename || '未知文件'}</span>
                            </div>
                            <button 
                              onClick={() => {
                                setFormData(prev => ({
                                  ...prev,
                                  [field.id]: prev[field.id].filter((_: any, idx: number) => idx !== i)
                                }));
                              }}
                              className="text-gray-400 hover:text-red-500 transition-colors p-1"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {(field.type === FieldType.USER || field.type === FieldType.DEPARTMENT || field.type === FieldType.GROUP) && (
                  <div className="relative">
                    <div 
                      className="w-full border border-gray-200 rounded p-2.5 text-[14px] text-gray-700 bg-white flex justify-between items-center cursor-pointer hover:border-primary-500 transition-colors"
                      onClick={() => setActiveSelectorId(activeSelectorId === field.id ? null : field.id)}
                    >
                      <div className="flex gap-2 flex-wrap min-h-[20px]">
                        {formData[field.id] && formData[field.id].length > 0 ? (
                          formData[field.id].map((item: any, idx: number) => (
                            <div key={idx} className="flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded text-[13px] text-gray-700">
                              {item.real_name || item.name || item}
                            </div>
                          ))
                        ) : (
                          <span className="text-gray-400">请选择人员/部门...</span>
                        )}
                      </div>
                      <span className="text-xs text-gray-400">▼</span>
                    </div>
                    {activeSelectorId === field.id && field.type === FieldType.USER && (
                      <div className="absolute top-full left-0 z-50 mt-1">
                        <ClickOutsideWrapper onClickOutside={() => setActiveSelectorId(null)}>
                          <UserSelector
                            value={formData[field.id] || []}
                            onChange={(val) => setFormData(prev => ({ ...prev, [field.id]: val }))}
                            onClose={() => setActiveSelectorId(null)}
                            multi={true}
                            publicMode={true}
                          />
                        </ClickOutsideWrapper>
                      </div>
                    )}
                  </div>
                )}

                {field.type === FieldType.HYPERLINK && (
                  <input 
                    type="url"
                    placeholder="请输入链接（例如 https://...）" 
                    value={formData[field.id] || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, [field.id]: e.target.value }))}
                    className="w-full border border-gray-200 rounded p-2.5 text-[14px] text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500" 
                  />
                )}
              </div>
            </div>
          ))}

          <div className="flex justify-center mt-8 pt-4">
            <button 
              onClick={handleSubmitForm} 
              disabled={loading}
              className="w-64 py-3 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-600 transition-all focus:ring-4 focus:ring-primary-500/20 text-[15px] shadow-sm disabled:bg-primary-300"
            >
              {loading ? '正在提交...' : '提交'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PublicCollectionForm;
