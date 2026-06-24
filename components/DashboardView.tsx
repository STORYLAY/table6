import React from 'react';
import { Column, Row, FieldType } from '../types';
import { ICONS } from '../constants';

interface DashboardViewProps {
  columns: Column[];
  rows: Row[];
}

const DashboardView: React.FC<DashboardViewProps> = ({ columns, rows }) => {
  // 计算简单的统计数据
  const totalRows = rows.length;
  
  // 找到第一个单选字段进行分组统计
  const groupCol = columns.find(c => c.type === FieldType.SELECT);
  const groupStats = groupCol ? rows.reduce((acc, row) => {
    const val = String(row.data[groupCol.id] || '未分类');
    acc[val] = (acc[val] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) : ({} as Record<string, number>);

  // 找到数字字段计算总和
  const numCol = columns.find(c => c.type === FieldType.NUMBER);
  const sumVal = numCol ? rows.reduce((sum, row) => {
    const val = parseFloat(row.data[numCol.id]);
    return sum + (isNaN(val) ? 0 : val);
  }, 0) : 0;

  return (
    <div className="flex-1 overflow-auto p-6 bg-gray-50">
      <div className="max-w-5xl mx-auto space-y-6">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <ICONS.Dashboard /> 仪表盘概览
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 卡片 1: 总记录数 */}
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
             <div className="text-sm text-gray-500 font-medium mb-2">总记录数</div>
             <div className="text-4xl font-bold text-primary-600">{totalRows}</div>
             <div className="mt-2 text-xs text-gray-400">当前表中的所有数据行</div>
          </div>

          {/* 卡片 2: 数字总和（如果有） */}
          {numCol && (
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="text-sm text-gray-500 font-medium mb-2">{numCol.name} 总计</div>
              <div className="text-4xl font-bold text-green-600">
                {numCol.format?.includes('¥') ? '¥' : ''}{sumVal.toLocaleString()}
                {numCol.format?.includes('%') ? '%' : ''}
              </div>
              <div className="mt-2 text-xs text-gray-400">基于 {numCol.name} 字段的自动汇总</div>
            </div>
          )}

          {/* 卡片 3: AI 洞察占位 */}
           <div className="bg-gradient-to-br from-indigo-50 to-purple-50 p-6 rounded-xl border border-indigo-100 shadow-sm">
              <div className="text-sm text-indigo-600 font-medium mb-2 flex items-center gap-1"><ICONS.Robot /> 智能分析</div>
              <div className="text-sm text-gray-600 leading-relaxed">
                 AI 正在持续监控数据变化，为您提供实时业务洞察和异常预警。
              </div>
           </div>
        </div>

        {/* 图表区域（模拟） */}
        {groupCol && (
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
             <h3 className="text-lg font-bold text-gray-800 mb-4">按 {groupCol.name} 分布</h3>
             <div className="space-y-4">
               {Object.entries(groupStats).map(([key, count]) => {
                  const percentage = totalRows > 0 ? Math.round((Number(count) / totalRows) * 100) : 0;
                  return (
                    <div key={key}>
                       <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium text-gray-700">{key}</span>
                          <span className="text-gray-500">{count} ({percentage}%)</span>
                       </div>
                       <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary-500 rounded-full" 
                            style={{ width: `${percentage}%` }}
                          />
                       </div>
                    </div>
                  );
               })}
             </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
           <div className="bg-white h-64 rounded-xl border border-gray-100 shadow-sm flex items-center justify-center text-gray-300 flex-col gap-2">
              <svg className="w-12 h-12 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" /></svg>
              <span className="text-sm">趋势图表开发中...</span>
           </div>
           <div className="bg-white h-64 rounded-xl border border-gray-100 shadow-sm flex items-center justify-center text-gray-300 flex-col gap-2">
              <svg className="w-12 h-12 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" /></svg>
              <span className="text-sm">占比分析开发中...</span>
           </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardView;