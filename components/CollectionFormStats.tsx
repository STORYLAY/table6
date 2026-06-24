import React, { useState, useEffect } from 'react';
import { Table, Column, Row, FieldType, CollectionFormStatistics } from '../types';
import { api } from '../services/api';
import { toast } from 'sonner';
import { ICONS, FIELD_TYPE_ICONS, formatFieldValue, parseJsonArray } from '../constants';
import { FilePreviewModal } from './FilePreviewModal';

interface CollectionFormStatsProps {
  table: Table;
  formFields: Column[];
}

export const CollectionFormStats: React.FC<CollectionFormStatsProps> = ({ table, formFields }) => {
  const [days, setDays] = useState<number>(30);
  const [loading, setLoading] = useState<boolean>(true);
  const [apiStats, setApiStats] = useState<CollectionFormStatistics | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [rowsLoading, setRowsLoading] = useState<boolean>(true);
  const [hoveredTrendIndex, setHoveredTrendIndex] = useState<number | null>(null);

  const [previewFile, setPreviewFile] = useState<{
    blob: Blob;
    filename: string;
  } | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState<boolean>(false);

  const handlePreview = async (f: any) => {
    try {
      setIsPreviewLoading(true);
      const fileId = typeof f === "object" ? f.id || f.path : f;
      const filename = typeof f === "object" ? f.filename || f.name : f;
      const blob = await api.getFileBlob(fileId);
      setPreviewFile({ blob, filename: filename || "文件" });
    } catch (e: any) {
      console.error("Preview failed:", e);
      toast.error(e.message || "获取文件内容失败");
    } finally {
      setIsPreviewLoading(false);
    }
  };

  useEffect(() => {
    const fetchApiStats = async () => {
      setLoading(true);
      try {
        const res = await api.getCollectionFormStatistics(table.id, days);
        if (res && res.data) {
          setApiStats(res.data);
        }
      } catch (err: any) {
        console.error('Failed to fetch public form statistics', err);
        // Fallback or alert
        if (err.message && err.message.includes('401')) {
          toast.error("未登录或 token 失效，请配置您的 console_token");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchApiStats();
  }, [table.id, days]);

  useEffect(() => {
    const fetchRows = async () => {
      setRowsLoading(true);
      try {
        const res = await api.getRows(table.id, { page: 1, page_size: 1000 });
        if (res && res.data && Array.isArray(res.data.list)) {
          setRows(res.data.list);
        }
      } catch (err) {
        console.error('Failed to fetch table rows for local field stats', err);
      } finally {
        setRowsLoading(false);
      }
    };

    fetchRows();
  }, [table.id]);

  // Compute analytics for active form fields using the rows data
  const getFieldAnalytics = (field: Column) => {
    const totalSubmissions = rows.length;
    let filledCount = 0;
    
    // Default stats
    const stats: Record<string, number> = {};
    const values: number[] = [];

    rows.forEach(row => {
      const val = row.data[field.id];
      
      if (field.type === FieldType.CHECKBOX) {
        filledCount++; // Always counts as filled because every submitted form has checkbox in true or false state
        const isTrue = val === true || val === 'true' || val === 'checked' || val === 1 || val === '1' || val === 'Yes' || val === '是';
        const key = isTrue ? '是 (已勾选)' : '否 (未勾选)';
        stats[key] = (stats[key] || 0) + 1;
      } else if (val !== undefined && val !== null && val !== '') {
        filledCount++;
        
        if (field.type === FieldType.SELECT) {
          const stringVal = String(val);
          stats[stringVal] = (stats[stringVal] || 0) + 1;
        } else if (field.type === FieldType.MULTI_SELECT) {
          const arr = Array.isArray(val) ? val : typeof val === 'string' ? val.split(',') : [val];
          arr.forEach((item: any) => {
            const stringItem = String(item).trim();
            if (stringItem) {
              stats[stringItem] = (stats[stringItem] || 0) + 1;
            }
          });
        } else if (field.type === FieldType.NUMBER) {
          const num = Number(val);
          if (!isNaN(num)) {
            values.push(num);
          }
        }
      }
    });

    // In checkbox case, make sure to list both true and false even if 0
    if (field.type === FieldType.CHECKBOX) {
      if (!stats['是 (已勾选)']) stats['是 (已勾选)'] = 0;
      if (!stats['否 (未勾选)']) stats['否 (未勾选)'] = 0;
    }

    // Number stats mapping
    let numberSummary = null;
    if (field.type === FieldType.NUMBER && values.length > 0) {
      const sum = values.reduce((a, b) => a + b, 0);
      const avg = sum / values.length;
      const min = Math.min(...values);
      const max = Math.max(...values);
      numberSummary = {
        sum: Number(sum.toFixed(2)),
        avg: Number(avg.toFixed(2)),
        min: Number(min.toFixed(2)),
        max: Number(max.toFixed(2)),
        count: values.length
      };
    }

    // Custom formatting for option mapping
    const options = field.config?.options || [];
    const optionAnalysis = options.map(opt => {
      const count = stats[opt] || 0;
      const pct = filledCount > 0 ? (count / filledCount) * 100 : 0;
      return { option: opt, count, percentage: pct };
    }).sort((a, b) => b.count - a.count);

    // Other adhoc option stats (like if row contains values not in standard options)
    const extraOptions: { option: string; count: number; percentage: number }[] = [];
    Object.keys(stats).forEach(key => {
      if (!options.includes(key) && field.type === FieldType.SELECT) {
        const count = stats[key];
        const pct = filledCount > 0 ? (count / filledCount) * 100 : 0;
        extraOptions.push({ option: key, count, percentage: pct });
      }
    });

    let combinedOptions = [...optionAnalysis, ...extraOptions];

    if (field.type === FieldType.CHECKBOX) {
      const yesCount = stats['是 (已勾选)'] || 0;
      const noCount = stats['否 (未勾选)'] || 0;
      const total = yesCount + noCount || filledCount || 1;
      combinedOptions = [
        { option: '是 (已勾选)', count: yesCount, percentage: (yesCount / total) * 100 },
        { option: '否 (未勾选)', count: noCount, percentage: (noCount / total) * 100 }
      ];
    }

    return {
      totalSubmissions,
      filledCount,
      filledPercentage: totalSubmissions > 0 ? (filledCount / totalSubmissions) * 100 : 0,
      options: combinedOptions,
      numberSummary,
      rawStats: stats,
    };
  };

  // Build simple SVG for sparklines and trends
  const renderTrendChart = () => {
    if (!apiStats || !apiStats.trend || apiStats.trend.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center p-12 bg-gray-50 border border-dashed border-gray-200 rounded-xl">
          <svg className="w-12 h-12 text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2" />
          </svg>
          <span className="text-[13px] text-gray-400">暂无趋势数据</span>
        </div>
      );
    }

    const { trend } = apiStats;
    const maxCount = Math.max(...trend.map(t => t.count), 5); // ensure some scaling

    const chartWidth = 900;
    const chartHeight = 220;
    const paddingLeft = 35;
    const paddingRight = 15;
    const paddingTop = 20;
    const paddingBottom = 25;

    const useableWidth = chartWidth - paddingLeft - paddingRight;
    const useableHeight = chartHeight - paddingTop - paddingBottom;

    const points = trend.map((v, i) => {
      const x = paddingLeft + (i / (trend.length - 1 || 1)) * useableWidth;
      const y = paddingTop + useableHeight - (v.count / maxCount) * useableHeight;
      return { x, y, data: v };
    });

    const activePoint = hoveredTrendIndex !== null ? points[hoveredTrendIndex] : null;

    // SVG path standard & area path
    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const areaPath = points.length > 0 
      ? `${linePath} L ${points[points.length - 1].x} ${chartHeight - paddingBottom} L ${points[0].x} ${chartHeight - paddingBottom} Z`
      : '';

    return (
      <div className="relative bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div className="flex flex-col">
            <span className="text-[14px] font-bold text-gray-900">数据收集趋势</span>
            <span className="text-[12px] text-gray-500">每日收到问卷提交的新增走势</span>
          </div>
          
          {/* Day range picker */}
          <div className="flex items-center bg-gray-50 rounded-lg p-0.5 border border-gray-100">
            {[7, 15, 30].map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1 rounded-md text-[12px] font-medium transition-colors ${days === d ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
              >
                {d}天
              </button>
            ))}
          </div>
        </div>

        {/* The SVG element */}
        <div className="relative select-none w-full">
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-auto overflow-visible">
            <defs>
              <linearGradient id="trendAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--client-primary-color)" stopOpacity="0.25" />
                <stop offset="100%" stopColor="var(--client-primary-color)" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Horizontal Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
              const y = paddingTop + ratio * useableHeight;
              const val = Math.round(maxCount * (1 - ratio));
              return (
                <g key={idx}>
                  <line 
                    x1={paddingLeft} 
                    y1={y} 
                    x2={chartWidth - paddingRight} 
                    y2={y} 
                    stroke="#f3f4f6" 
                    strokeWidth="1" 
                    strokeDasharray={idx === 4 ? "0" : "4 4"}
                  />
                  <text 
                    x={paddingLeft - 8} 
                    y={y + 4} 
                    textAnchor="end" 
                    className="fill-gray-400 font-mono text-[10px]"
                  >
                    {val}
                  </text>
                </g>
              );
            })}

            {/* Shaded Area fill */}
            {areaPath && <path d={areaPath} fill="url(#trendAreaGrad)" />}

            {/* Main Trend Line */}
            {linePath && (
              <path 
                d={linePath} 
                fill="none" 
                stroke="currentColor"
                className="text-primary-600"
                strokeWidth="2.5" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
              />
            )}

            {/* Invisible interactive bars to help with hover detection */}
            {points.map((p, i) => {
              const barWidth = useableWidth / trend.length;
              const hoverX = p.x - barWidth / 2;
              return (
                <rect
                  key={i}
                  x={hoverX}
                  y={0}
                  width={barWidth}
                  height={chartHeight - paddingBottom}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredTrendIndex(i)}
                  onMouseLeave={() => setHoveredTrendIndex(null)}
                />
              );
            })}

            {/* Highlighted active node */}
            {activePoint && (
              <g>
                <line
                  x1={activePoint.x}
                  y1={paddingTop}
                  x2={activePoint.x}
                  y2={chartHeight - paddingBottom}
                  stroke="#3b82f6"
                  strokeWidth="1.5"
                  strokeDasharray="2 2"
                />
                <circle
                  cx={activePoint.x}
                  cy={activePoint.y}
                  r="6"
                  fill="#ffffff"
                  stroke="var(--client-primary-color)"
                  strokeWidth="3"
                  className="shadow-sm"
                />
              </g>
            )}

            {/* X Axis Labels */}
            {points.map((p, i) => {
              // Only display some labels so it doesn't get cluttered
              const total = points.length;
              let showLabel = false;
              if (total <= 10) showLabel = true;
              else if (total <= 20) showLabel = i % 2 === 0;
              else showLabel = i % 5 === 0 || i === total - 1;

              if (!showLabel) return null;

              // Format date (convert 2019-08-24 to 08-24)
              let displayDate = p.data.date;
              if (displayDate.includes('-')) {
                const parts = displayDate.split('-');
                if (parts.length >= 3) displayDate = `${parts[1]}-${parts[2]}`;
              }

              return (
                <text
                  key={i}
                  x={p.x}
                  y={chartHeight - paddingBottom + 16}
                  textAnchor="middle"
                  className="fill-gray-400 text-[10px] select-none font-medium"
                >
                  {displayDate}
                </text>
              );
            })}
          </svg>

          {/* Absolute overlay tooltip container */}
          {activePoint && (
            <div 
              style={{
                position: 'absolute',
                top: `${(activePoint.y / chartHeight) * 100 - 30}%`,
                left: `${(activePoint.x / chartWidth) * 100}%`,
                transform: 'translateX(-50%)',
              }}
              className="bg-gray-900 text-white rounded-lg px-3 py-1.5 shadow-lg flex flex-col gap-0.5 text-center pointer-events-none z-50 min-w-[80px]"
            >
              <span className="text-[10px] text-gray-300 font-medium font-mono">{activePoint.data.date}</span>
              <span className="text-[13px] font-bold font-mono">{activePoint.data.count} 份</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Helper stats for headers
  const totalCount = apiStats ? apiStats.total_count : rows.length;
  const todayCount = apiStats ? apiStats.today_count : 0;
  const activeFieldsCount = formFields.length;

  return (
    <div className="w-full max-w-4xl mx-auto py-8 px-4 flex flex-col gap-6 animate-fade-in">
      {/* Upper overview stats card row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm flex items-center gap-4.5">
          <div className="w-12 h-12 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center shrink-0">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div className="flex flex-col">
            <span className="text-[12px] font-medium text-gray-500 uppercase tracking-wide">总提交数</span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-[26px] font-bold text-gray-900 font-mono leading-none">{loading ? '...' : totalCount}</span>
              <span className="text-[12px] text-gray-500">份</span>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm flex items-center gap-4.5">
          <div className="w-12 h-12 rounded-xl bg-green-50 text-green-600 flex items-center justify-center shrink-0">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex flex-col">
            <span className="text-[12px] font-medium text-gray-500 uppercase tracking-wide">今日提交</span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-[26px] font-bold text-gray-900 font-mono leading-none">{loading ? '...' : todayCount}</span>
              <span className="text-[12px] text-gray-500">份</span>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm flex items-center gap-4.5">
          <div className="w-12 h-12 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h7" />
            </svg>
          </div>
          <div className="flex flex-col">
            <span className="text-[12px] font-medium text-gray-500 uppercase tracking-wide">配置字段数</span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-[26px] font-bold text-gray-900 font-mono leading-none">{activeFieldsCount}</span>
              <span className="text-[12px] text-gray-500">个</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Trend Line Chart */}
      {loading ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm h-[220px] flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-[13px] text-gray-400">加载趋势中...</span>
          </div>
        </div>
      ) : (
        renderTrendChart()
      )}

      {/* Dynamic Form Field Breakdown Section */}
      <div className="flex flex-col gap-4 mt-2">
        <div className="flex flex-col">
          <h2 className="text-[16px] font-bold text-gray-900">字段多维数据分析</h2>
          <p className="text-[12px] text-gray-500">通过收集到的行数据智能计算选项和数值分布情况</p>
        </div>

        {rowsLoading ? (
          <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center text-gray-400 text-sm">
            <div className="inline-block w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mb-2"></div>
            <div>分析行数据中...</div>
          </div>
        ) : rows.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center text-gray-400 text-[13px] border-dashed">
            没有收取到有效问卷提交，暂时无法进行具体的字段分布细节统计。
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {formFields.map(field => {
              const analysis = getFieldAnalytics(field);
              
              return (
                <div key={field.id} className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm hover:shadow-md/5 transition-all">
                  {/* Field Header / Meta info */}
                  <div className="flex items-start justify-between border-b border-gray-50 pb-4 mb-5">
                    <div className="flex items-center gap-2.5">
                      <span className="w-8 h-8 rounded-lg bg-gray-50 text-gray-600 flex items-center justify-center shrink-0 border border-gray-100">
                        {FIELD_TYPE_ICONS[field.type] ? (
                          <span className="w-4.5 h-4.5 flex items-center justify-center text-gray-500 shrink-0">
                            {FIELD_TYPE_ICONS[field.type]}
                          </span>
                        ) : (
                          <svg className="w-4.5 h-4.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        )}
                      </span>
                      <div className="flex flex-col">
                        <span className="text-[14px] font-bold text-gray-900">{field.name}</span>
                        <span className="text-[11px] text-gray-400 font-mono tracking-wider">{field.type}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-[12px] bg-gray-50 text-gray-500 rounded-full px-3 py-1 font-medium">
                      <span>填写率</span>
                      <span className="text-gray-900 font-bold">{analysis.filledCount}/{analysis.totalSubmissions}</span>
                      <span className="text-primary-600 font-bold">({analysis.filledPercentage.toFixed(0)}%)</span>
                    </div>
                  </div>

                  {/* Options Stats (SELECT, MULTI_SELECT, CHECKBOX) */}
                  {(field.type === FieldType.SELECT || field.type === FieldType.MULTI_SELECT || field.type === FieldType.CHECKBOX) && (
                    <div className="flex flex-col gap-4.5">
                      {analysis.options.length === 0 ? (
                        <div className="text-[12px] text-gray-400 bg-gray-50/50 rounded-xl p-4 text-center">暂无选项配置或选项提交数据</div>
                      ) : (
                        analysis.options.map((opt, i) => (
                          <div key={i} className="flex flex-col gap-2">
                            <div className="flex items-center justify-between text-[13px] font-medium text-gray-700">
                              <span className="truncate max-w-[70%]">{opt.option || <span className="text-gray-400 italic">空值</span>}</span>
                              <div className="flex items-center gap-2 font-mono text-[12px]">
                                <span className="text-gray-900 font-semibold">{opt.count} 份</span>
                                <span className="text-gray-400">|</span>
                                <span className="text-primary-600 font-bold">{opt.percentage.toFixed(1)}%</span>
                              </div>
                            </div>
                            
                            {/* Horizontal styled progress bar wrapper */}
                            <div className="w-full h-2 rounded-full bg-gray-50 overflow-hidden relative border border-gray-100/50">
                              <div 
                                style={{ width: `${opt.percentage}%` }}
                                className="h-full bg-primary-500 rounded-full transition-all duration-300"
                              />
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* Stats for Number Fields (NUMBER) */}
                  {field.type === FieldType.NUMBER && (
                    <div>
                      {analysis.numberSummary ? (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-gray-50/50 border border-gray-100/50 rounded-xl p-4">
                          <div className="flex flex-col p-1.5">
                            <span className="text-[11px] text-gray-400 uppercase tracking-wide font-medium">平均值 (Avg)</span>
                            <span className="text-[18px] font-extrabold text-primary-600 font-mono mt-1">{analysis.numberSummary.avg}</span>
                          </div>
                          <div className="flex flex-col p-1.5">
                            <span className="text-[11px] text-gray-400 uppercase tracking-wide font-medium">总和 (Sum)</span>
                            <span className="text-[18px] font-extrabold text-gray-900 font-mono mt-1">{analysis.numberSummary.sum}</span>
                          </div>
                          <div className="flex flex-col p-1.5">
                            <span className="text-[11px] text-gray-400 uppercase tracking-wide font-medium">最大值 (Max)</span>
                            <span className="text-[18px] font-extrabold text-gray-900 font-mono mt-1">{analysis.numberSummary.max}</span>
                          </div>
                          <div className="flex flex-col p-1.5">
                            <span className="text-[11px] text-gray-400 uppercase tracking-wide font-medium">最小值 (Min)</span>
                            <span className="text-[18px] font-extrabold text-gray-900 font-mono mt-1">{analysis.numberSummary.min}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-[12px] text-gray-400 bg-gray-50/50 rounded-xl p-4 text-center">暂无有效数值提交数据</div>
                      )}
                    </div>
                  )}

                  {/* Stats/Previews for Attachment Fields (ATTACHMENT) */}
                  {field.type === FieldType.ATTACHMENT && (
                    <div className="flex flex-col gap-3">
                      <div className="text-[12px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                        最近收到的文件附件 ({Math.min(analysis.filledCount, 15)}):
                      </div>
                      {(() => {
                        const allFiles: any[] = [];
                        rows.forEach(row => {
                          const val = row.data[field.id];
                          const parsed = parseJsonArray(val);
                          parsed.forEach(f => {
                            if (f && (f.path || f.url)) {
                              allFiles.push({
                                ...f,
                                rowId: row.id
                              });
                            }
                          });
                        });

                        if (allFiles.length === 0) {
                          return (
                            <div className="text-[12px] text-gray-400 bg-gray-50/50 rounded-xl p-4 text-center">
                              暂无上传的附件文件
                            </div>
                          );
                        }

                        return (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                            {allFiles.slice(0, 16).map((file, fileIdx) => {
                              const fName = file.filename || file.name || '未命名文件';
                              const fUrl = file.url || api.getFileUrl(file.path);
                              const fExt = (file.extension || fName.split('.').pop() || 'FILE').toLowerCase();
                              
                              // Check if file is image for thumbnail preview
                              const isImage = file.type?.startsWith('image') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(fExt);
                              
                              return (
                                <button
                                  key={fileIdx}
                                  type="button"
                                  onClick={() => handlePreview(file)}
                                  className="group w-full flex items-center justify-between p-3.5 bg-gray-50 hover:bg-primary-50/35 border border-gray-100 hover:border-primary-200/50 rounded-xl transition-all duration-200 shadow-sm hover:shadow text-left"
                                >
                                  <div className="flex items-center gap-3 min-w-0 flex-1">
                                    {/* Icon or Thumbnail */}
                                    {isImage ? (
                                      <div className="w-11 h-11 rounded-lg border border-gray-200 overflow-hidden bg-white shrink-0 shadow-sm flex items-center justify-center">
                                        <img 
                                          src={fUrl} 
                                          className="w-full h-full object-cover" 
                                          alt={fName} 
                                          onError={(e) => {
                                            e.currentTarget.style.display = 'none';
                                            if (e.currentTarget.nextElementSibling) {
                                              e.currentTarget.nextElementSibling.classList.remove('hidden');
                                              e.currentTarget.nextElementSibling.classList.add('flex');
                                            }
                                          }} 
                                        />
                                        <div className="hidden flex-col items-center justify-center text-gray-400 w-full h-full">
                                          <span className="font-mono text-[9px] font-bold text-gray-400 uppercase tracking-wide">IMG</span>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="w-11 h-11 rounded-lg bg-primary-100/60 border border-primary-100 text-primary-600 shrink-0 flex flex-col items-center justify-center shadow-sm">
                                        <span className="font-mono text-[10px] font-extrabold uppercase tracking-wide">
                                          {fExt.substring(0, 4)}
                                        </span>
                                      </div>
                                    )}

                                    {/* Name and Meta */}
                                    <div className="flex flex-col min-w-0 flex-1">
                                      <span className="text-[13px] font-semibold text-gray-800 truncate group-hover:text-primary-600 transition-colors">
                                        {fName}
                                      </span>
                                      {file.size && (
                                        <span className="text-[10px] text-gray-400 font-mono mt-0.5">
                                          {(file.size / 1024 < 1024) 
                                            ? `${(file.size / 1024).toFixed(1)} KB` 
                                            : `${(file.size / (1024 * 1024)).toFixed(1)} MB`
                                          }
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Download/Open icon action */}
                                  <div className="w-8 h-8 rounded-full bg-white group-hover:bg-primary-600/10 text-gray-400 group-hover:text-primary-600 border border-gray-100 flex items-center justify-center shrink-0 transition-colors ml-2">
                                    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Fallback Display for items (TEXT, DATE, etc.) */}
                  {field.type !== FieldType.SELECT && field.type !== FieldType.MULTI_SELECT && field.type !== FieldType.CHECKBOX && field.type !== FieldType.NUMBER && field.type !== FieldType.ATTACHMENT && (
                    <div className="flex flex-col gap-2.5">
                      <div className="text-[12px] font-bold text-gray-400 uppercase tracking-wider mb-1">最近收到的响应值 ({Math.min(analysis.filledCount, 5)}):</div>
                      {rows
                        .filter(r => r.data[field.id] !== undefined && r.data[field.id] !== null && r.data[field.id] !== '')
                        .slice(0, 5)
                        .map((row, index) => {
                          const val = row.data[field.id];
                          const renderedVal = formatFieldValue(val, field.type);

                          return (
                            <div key={index} className="px-3.5 py-2.5 bg-gray-50/40 border border-gray-100/30 rounded-xl text-[13px] text-gray-800 break-all select-text font-normal">
                              {renderedVal}
                            </div>
                          );
                        })}
                      {analysis.filledCount === 0 && (
                        <div className="text-[12px] text-gray-400 bg-gray-50/50 rounded-xl p-4 text-center">暂无提交值数据</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* File Preview Modal */}
      <FilePreviewModal
        isOpen={!!previewFile}
        onClose={() => setPreviewFile(null)}
        fileBlob={previewFile?.blob || null}
        filename={previewFile?.filename || ""}
      />

      {/* Loading Overlay for Preview */}
      {isPreviewLoading && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-white/50">
          <div className="flex flex-col items-center gap-3 bg-white p-6 rounded-xl shadow-xl border border-gray-100">
            <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm font-medium text-gray-700">正在加载预览...</span>
          </div>
        </div>
      )}
    </div>
  );
};
