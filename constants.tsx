
import React from 'react';
import { FieldType, ViewType, Table } from './types';

// Updated Mock Data conforming to the new Table/Column/Row types
export const INITIAL_DATA: Table[] = [
  {
    id: 't1',
    name: '项目路线图',
    role: 'MANAGE',
    columns: [
      { 
        id: 'c1', 
        name: '任务名称', 
        type: FieldType.TEXT, 
        width: 220, 
        config: {}, 
        sort: 0 
      },
      { 
        id: 'c2', 
        name: '状态', 
        type: FieldType.SELECT, 
        width: 140, 
        config: {
          options: ['待处理', '进行中', '已完成', '待审核'],
          option_colors: { '待处理': 'gray', '进行中': 'blue', '已完成': 'green', '待审核': 'orange' }
        },
        sort: 1
      },
      { 
        id: 'c3', 
        name: '优先级', 
        type: FieldType.SELECT, 
        width: 120, 
        config: {
          options: ['最高', '中', '最低'],
          option_colors: { '最高': 'red', '中': 'yellow', '最低': 'blue' }
        },
        sort: 2
      },
      { 
        id: 'c4', 
        name: '截止日期', 
        type: FieldType.DATE, 
        width: 160, 
        config: {}, 
        sort: 3 
      },
      { 
        id: 'c5', 
        name: '负责人', 
        type: FieldType.USER, 
        width: 150, 
        config: {}, 
        sort: 4 
      },
    ],
    rows: [
      { id: 'r1', data: { c1: '集成 Gemini API', c2: '进行中', c3: '最高', c4: '2024-06-01', c5: '张伟' }, index: 0 },
      { id: 'r2', data: { c1: 'UI 设计稿优化', c2: '已完成', c3: '中', c4: '2024-05-20', c5: '李芳' }, index: 1 },
      { id: 'r3', data: { c1: '看板视图逻辑实现', c2: '待处理', c3: '最高', c4: '2024-06-05', c5: '王强' }, index: 2 },
      { id: 'r4', data: { c1: '用户体验测试', c2: '待处理', c3: '最低', c4: '2024-06-15', c5: '未分配' }, index: 3 },
    ],
    views: [
      { id: 'v1', name: '表格', type: ViewType.GRID, config: {} },
      { id: 'v2', name: '看板', type: ViewType.KANBAN, config: { groupBy: 'c2' } },
      { id: 'v3', name: '日历', type: ViewType.CALENDAR, config: { dateField: 'c4' } }
    ]
  }
];

export const TEMPLATES: Table[] = [
  {
    id: 'temp_crm',
    name: '销售 CRM',
    role: 'MANAGE',
    columns: [
      { id: 'tc1', name: '客户名称', type: FieldType.TEXT, width: 180, config: {} },
      { 
        id: 'tc2', 
        name: '销售阶段', 
        type: FieldType.SELECT, 
        width: 130, 
        config: {
          options: ['线索', '意向', '谈判', '成交', '流失'],
          option_colors: { '线索': 'blue', '意向': 'purple', '谈判': 'orange', '成交': 'green', '流失': 'gray' }
        }
      },
      { id: 'tc3', name: '预计金额', type: FieldType.NUMBER, format: '¥0.00', width: 120, config: {} },
      { id: 'tc4', name: '跟进日期', type: FieldType.DATE, width: 150, config: {} },
    ],
    rows: [
      { id: 'tr1', data: { tc1: '科技无限公司', tc2: '谈判', tc3: 50000, tc4: '2024-05-25' }, index: 0 },
      { id: 'tr2', data: { tc1: '未来工作室', tc2: '意向', tc3: 12000, tc4: '2024-05-28' }, index: 1 },
    ],
    views: [
      { id: 'tv1', name: '全部线索', type: ViewType.GRID, config: {} },
      { id: 'tv2', name: '销售漏斗', type: ViewType.KANBAN, config: { groupBy: 'tc2' } },
      { id: 'tv3', name: '销售仪表盘', type: ViewType.DASHBOARD, config: {} }
    ]
  },
  {
    id: 'temp_bug',
    name: '缺陷追踪',
    role: 'MANAGE',
    columns: [
      { id: 'bc1', name: '缺陷标题', type: FieldType.TEXT, width: 250, config: {} },
      { 
        id: 'bc2', 
        name: '严重程度', 
        type: FieldType.SELECT, 
        width: 120, 
        config: {
          options: ['致命', '严重', '一般', '轻微'],
          option_colors: { '致命': 'red', '严重': 'orange', '一般': 'blue', '轻微': 'green' }
        }
      },
      { 
        id: 'bc3', 
        name: '状态', 
        type: FieldType.SELECT, 
        width: 120, 
        config: {
          options: ['新建', '处理中', '已修复', '已验证'],
          option_colors: { '新建': 'blue', '处理中': 'yellow', '已修复': 'green', '已验证': 'teal' }
        }
      },
      { id: 'bc4', name: '发现人', type: FieldType.USER, width: 120, config: {} },
    ],
    rows: [
      { id: 'br1', data: { bc1: '登录页验证码失效', bc2: '严重', bc3: '新建', bc4: '测试A' }, index: 0 },
    ],
    views: [
      { id: 'bv1', name: '缺陷列表', type: ViewType.GRID, config: {} },
      { id: 'bv2', name: '状态看板', type: ViewType.KANBAN, config: { groupBy: 'bc3' } }
    ]
  }
];

type IconProps = React.SVGProps<SVGSVGElement>;

export const ICONS = {
  Book: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477-4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>,
  Bell: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>,
  Grid: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>,
  Kanban: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 00-2-2h-2a2 2 0 00-2 2m0 10V7" /></svg>,
  Calendar: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
  Settings: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  Search: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>,
  Plus: (props: IconProps) => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" /></svg>,
  Download: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>,
  File: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>,
  Robot: (props: IconProps) => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>,
  Dashboard: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
  Form: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  Import: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>,
  Template: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>,
  Filter: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>,
  Group: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16m-7 6h7" /></svg>,
  Sort: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" /></svg>,
  Height: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>,
  Color: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg>,
  Check: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>,
  ChevronRight: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" /></svg>,
  ChevronsRight: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>,
  ChevronsLeft: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>,
  ChevronDown: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" /></svg>,
  Gallery: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
  Gantt: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>,
  GripVertical: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h.01M9 6h.01M9 18h.01M15 12h.01M15 6h.01M15 18h.01" /></svg>,
  Eye: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>,
  EyeOff: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>,
  Message: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>,
  Trash: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
  Send: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>,
  Branch: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg>,
  Lock: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>,
  Undo: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>,
  Redo: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" /></svg>,
  ArrowUp: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>,
  ArrowDown: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>,
  ArrowLeft: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>,
  ArrowRight: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>,
  Copy: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>,
  Paste: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>,
  Edit: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>,
  MoreHorizontal: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" /></svg>,
  Link: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>,
  Lookup: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" /></svg>,
  SearchRef: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16l2.879-2.879m0 0a3 3 0 104.243-4.242 3 3 0 00-4.243 4.242zM21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  Palette: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg>,
  Sparkles: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-7.714 2.143L11 21l-2.286-6.857L1 12l7.714-2.143L11 3z" /></svg>,
  Close: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" /></svg>,
  Code: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>,
  Help: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  List: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>,
  User: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>,
  Text: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h8m-8 6h16" /><text x="4" y="14" fontSize="10" fontWeight="bold" fill="currentColor" stroke="none">Aa</text></svg>,
  Users: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>,
  Building: (props: IconProps) => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>,
};

export const FIELD_TYPE_ICONS: Record<FieldType, React.ReactNode> = {
  [FieldType.TEXT]: <ICONS.Text className="w-3.5 h-3.5 text-gray-500" />,
  [FieldType.NUMBER]: <span className="font-mono text-gray-500 font-bold text-xs">#</span>,
  [FieldType.SELECT]: <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" strokeWidth="1.5"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>,
  [FieldType.MULTI_SELECT]: <ICONS.List className="w-3.5 h-3.5 text-gray-500" />,
  [FieldType.DATE]: <ICONS.Calendar className="w-3.5 h-3.5 text-gray-500" />,
  [FieldType.TIME]: <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  [FieldType.CHECKBOX]: <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="1.5"/><path d="M9 12l2 2 4-4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  [FieldType.FORMULA]: <span className="font-mono text-gray-500 font-bold text-xs">ƒx</span>,
  [FieldType.ATTACHMENT]: <ICONS.Link className="w-3.5 h-3.5 text-gray-500" />,
  [FieldType.USER]: <ICONS.User className="w-3.5 h-3.5 text-gray-500" />,
  [FieldType.DEPARTMENT]: <ICONS.Building className="w-3.5 h-3.5 text-gray-500" />,
  [FieldType.GROUP]: <ICONS.Users className="w-3.5 h-3.5 text-gray-500" />,
  [FieldType.LINK]: <ICONS.Link className="w-3.5 h-3.5 text-gray-500" />,
  [FieldType.HYPERLINK]: <ICONS.Link className="w-3.5 h-3.5 text-gray-500" />,
  [FieldType.LOOKUP]: <ICONS.Lookup className="w-3.5 h-3.5 text-gray-500" />,
  [FieldType.SEARCH_REFERENCE]: <ICONS.SearchRef className="w-3.5 h-3.5 text-gray-500" />,
};

export type TagColorKey = 'gray' | 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'pink' | 'indigo' | 'orange' | 'teal';

export const TAG_COLORS: Record<string, { bg: string, text: string, border: string }> = {
  gray: { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200' },
  blue: { bg: 'bg-primary-100', text: 'text-primary-700', border: 'border-primary-200' },
  green: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200' },
  yellow: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-200' },
  red: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' },
  purple: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' },
  pink: { bg: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-200' },
  indigo: { bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-200' },
  orange: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' },
  teal: { bg: 'bg-teal-100', text: 'text-teal-700', border: 'border-teal-200' },
};

export const getTagColor = (val: any, configColors?: Record<string, string>): { bg: string, text: string, border: string } => {
    if (val === null || val === undefined) return { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-200' };
    
    const stringVal = String(val);
    if (!stringVal) return { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-200' };
    
    const colorKey = configColors?.[stringVal] as TagColorKey;
    if (colorKey && TAG_COLORS[colorKey]) {
        return TAG_COLORS[colorKey];
    }
    
    // Deterministic default color based on value
    const keys = Object.keys(TAG_COLORS);
    let hash = 0;
    for (let i = 0; i < stringVal.length; i++) {
        hash = stringVal.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % keys.length;
    return TAG_COLORS[keys[index]];
};

export const formatDateForDisplay = (val: any, format: string = 'YYYY-MM-DD'): string => {
    if (!val) return '';
    let formattedDate = String(val);
    try {
        let dateVal = val;
        if (typeof val === 'string') {
            if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
                dateVal = val + 'T00:00:00';
            } else if (val.includes(' ') && !val.includes('T')) {
                dateVal = val.replace(' ', 'T');
            }
        }
        const date = new Date(dateVal);
        if (!isNaN(date.getTime())) {
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            const h = String(date.getHours()).padStart(2, '0');
            const min = String(date.getMinutes()).padStart(2, '0');
            const s = String(date.getSeconds()).padStart(2, '0');
            formattedDate = format
                .replace('YYYY', String(y))
                .replace('MM', m)
                .replace('DD', d)
                .replace('HH', h)
                .replace('mm', min)
                .replace('ss', s);
        }
    } catch (e) {}
    return formattedDate;
};

export const formatTimeForDisplay = (val: any, format: string = 'HH:mm'): string => {
    if (!val) return '';
    const strVal = String(val);
    // Assuming val comes from input type="time" which is generally "HH:mm" or "HH:mm:ss"
    const parts = strVal.split(':');
    if (parts.length >= 2) {
        const h = parts[0];
        const m = parts[1];
        const s = parts[2] || '00';
        return format
            .replace('HH', h)
            .replace('mm', m)
            .replace('ss', s);
    }
    return strVal;
};

export const formatDateForInput = (val: any, includeTime: boolean = false): string => {
    if (!val) return '';
    try {
        let dateVal = val;
        if (typeof val === 'string') {
            if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
                dateVal = val + 'T00:00:00';
            } else if (val.includes(' ') && !val.includes('T')) {
                dateVal = val.replace(' ', 'T');
            }
        }
        const date = new Date(dateVal);
        if (!isNaN(date.getTime())) {
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            if (includeTime) {
                const h = String(date.getHours()).padStart(2, '0');
                const min = String(date.getMinutes()).padStart(2, '0');
                return `${y}-${m}-${d}T${h}:${min}`;
            }
            return `${y}-${m}-${d}`;
        }
    } catch (e) {}
    return String(val);
};

export const formatFieldValue = (val: any, colType?: FieldType, format?: string): string => {
    if (val === null || val === undefined) return '';
    
    if (colType === FieldType.USER) {
        const users = parseJsonArray(val);
        return users.map((u: any) => typeof u === 'object' ? (u.name || u.email || '未知用户') : String(u)).join(', ');
    }
    
    if (colType === FieldType.DEPARTMENT) {
        const depts = parseJsonArray(val);
        return depts.map((d: any) => typeof d === 'object' ? (d.name || '未知部门') : String(d)).join(', ');
    }
    
    if (colType === FieldType.LINK) {
        const links = parseLinkValues(val);
        return links.map((l: any) => l.name || l.id || '未命名').join(', ');
    }
    
    if (colType === FieldType.ATTACHMENT) {
        const files = parseJsonArray(val);
        return files.map((f: any) => typeof f === 'object' ? (f.filename || f.name || '文件') : String(f)).join(', ');
    }

    if (colType === FieldType.DATE) {
        return formatDateForDisplay(val, format);
    }

    if (colType === FieldType.TIME) {
        return formatTimeForDisplay(val, format);
    }

    if (Array.isArray(val)) {
        return val.map(v => typeof v === 'object' ? (v.name || v.id || JSON.stringify(v)) : String(v)).join(', ');
    }
    
    if (typeof val === 'object') {
        return val.name || val.id || JSON.stringify(val);
    }
    
    return String(val);
};

export const parseJsonArray = (val: any): any[] => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') {
        try {
            let parsed = JSON.parse(val);
            if (typeof parsed === 'string') {
                try {
                    parsed = JSON.parse(parsed);
                } catch (e) {}
            }
            return Array.isArray(parsed) ? parsed : [parsed];
        } catch (e) {
            try {
                let fixedStr = val
                    .replace(/'/g, '"')
                    .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":')
                    .replace(/:\s*False/g, ': false')
                    .replace(/:\s*True/g, ': true')
                    .replace(/:\s*None/g, ': null');
                if (!fixedStr.trim().startsWith('[')) {
                    fixedStr = `[${fixedStr}]`;
                }
                const parsed = JSON.parse(fixedStr);
                return Array.isArray(parsed) ? parsed : [parsed];
            } catch (e2) {
                return [];
            }
        }
    }
    return [val];
};

export const parseLinkValues = (val: any): any[] => {
    if (!val) return [];
    
    // Helper to parse a single string that might be JSON
    const parseString = (str: string) => {
        // If it's already a string that looks like a plain name (no {}), just return it
        if (!str.includes('{') && !str.includes('}')) {
            return [{ id: str, name: str }];
        }

        try {
            const parsed = JSON.parse(str);
            // If it parsed to a string (e.g. it was double encoded), parse again or return
            if (typeof parsed === 'string') {
                if (parsed.includes('{')) return parseString(parsed);
                return [{ id: parsed, name: parsed }];
            }
            return Array.isArray(parsed) ? parsed : [parsed];
        } catch (e) {
            try {
                // Try to fix common JSON issues: single quotes to double quotes, unquoted keys
                let fixedStr = str
                    .replace(/'/g, '"') // Replace single quotes with double quotes
                    .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":') // Quote unquoted keys
                    .replace(/:\s*False/g, ': false')
                    .replace(/:\s*True/g, ': true')
                    .replace(/:\s*None/g, ': null');
                
                if (!fixedStr.trim().startsWith('[')) {
                    fixedStr = `[${fixedStr}]`;
                }
                const parsed = JSON.parse(fixedStr);
                return Array.isArray(parsed) ? parsed : [parsed];
            } catch (e2) {
                const values: any[] = [];
                // More forgiving regex: keys might not be quoted, values might use single or double quotes
                const idRegex = /['"]?id['"]?\s*:\s*['"]([^'"]+)['"]/;
                const nameRegex = /['"]?name['"]?\s*:\s*['"]([^'"]+)['"]/;
                
                // Try to extract multiple objects if it's a comma separated list of objects
                const objectStrs = str.split('},{');
                for (let objStr of objectStrs) {
                    const idMatch = idRegex.exec(objStr);
                    const nameMatch = nameRegex.exec(objStr);
                    if (idMatch && nameMatch) {
                        values.push({ id: idMatch[1], name: nameMatch[1] });
                    } else if (nameMatch) {
                        values.push({ id: nameMatch[1], name: nameMatch[1] });
                    }
                }
                
                if (values.length > 0) return values;
                return [{ id: str, name: str }];
            }
        }
    };

    if (typeof val === 'string') {
        return parseString(val);
    }
    
    if (Array.isArray(val)) {
        let result: any[] = [];
        for (const item of val) {
            if (typeof item === 'string') {
                result = result.concat(parseString(item));
            } else if (typeof item === 'object' && item !== null) {
                result.push(item);
            } else {
                result.push({ id: String(item), name: String(item) });
            }
        }
        return result;
    }
    
    if (typeof val === 'object' && val !== null) {
        return [val];
    }
    
    return [{ id: String(val), name: String(val) }];
};
