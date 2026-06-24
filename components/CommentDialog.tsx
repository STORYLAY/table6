
import React, { useState, useRef, useEffect } from 'react';
import { Comment } from '../types';
import { ICONS } from '../constants';
import { Tooltip } from './Tooltip';

interface CommentDialogProps {
  comments: Comment[];
  rowName?: string; // 新增：行名称
  columnName?: string; // 新增：列名称
  onAdd: (text: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const CommentDialog: React.FC<CommentDialogProps> = ({ 
  comments, 
  rowName = "未命名记录", 
  columnName = "未知字段", 
  onAdd, 
  onDelete, 
  onClose 
}) => {
  const [newComment, setNewComment] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [comments]);

  // 聚焦输入框
  useEffect(() => {
    if (textareaRef.current) {
        textareaRef.current.focus();
    }
  }, []);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newComment.trim()) return;
    onAdd(newComment);
    setNewComment('');
  };

  const handleReply = (author: string) => {
    const prefix = `回复 @${author} : `;
    setNewComment(prev => {
        // 如果已经有回复前缀，替换它，否则追加
        if (prev.startsWith('回复 @')) {
            return prefix;
        }
        return prefix + prev;
    });
    textareaRef.current?.focus();
  };

  return (
    <>
        {/* 透明遮罩，点击关闭，但允许看到背后的表格 */}
        <div className="fixed inset-0 z-[60]" onClick={onClose} />
        
        {/* 侧边栏主体 */}
        <div className="fixed right-0 top-[88px] bottom-0 w-80 bg-white shadow-[-5px_0_20px_rgba(0,0,0,0.05)] border-l border-gray-100 z-[70] flex flex-col animate-in slide-in-from-right duration-200">
            {/* 顶部装饰条 (匹配截图中的黄色) */}
            <div className="h-1 w-full bg-yellow-400 shrink-0"></div>

            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-start bg-white">
                <div>
                    <div className="text-base font-bold text-gray-800 flex items-center gap-2">
                        评论
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                        <Tooltip content={rowName}>
                            <span className="border-l-2 border-gray-300 pl-2 text-gray-600 font-medium truncate max-w-[120px]">
                                {rowName}
                            </span>
                        </Tooltip>
                        <span>•</span>
                        <Tooltip content={columnName}>
                            <span className="truncate max-w-[100px]">{columnName}</span>
                        </Tooltip>
                    </div>
                </div>
                <button 
                    onClick={onClose} 
                    className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-1.5 rounded transition-colors"
                >
                    ✕
                </button>
            </div>

            {/* Comment List */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6 bg-white">
                {comments.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-300 gap-3">
                        <div className="scale-150 opacity-30"><ICONS.Message /></div>
                        <p className="text-sm">暂无评论</p>
                    </div>
                ) : (
                    comments.map(comment => (
                    <div key={comment.id} className="flex gap-3 group">
                        {/* Avatar */}
                        <div className="w-8 h-8 rounded-full bg-purple-500 text-white flex items-center justify-center font-bold text-xs shrink-0 select-none shadow-sm mt-1">
                            {(comment.author ? comment.author[0] : 'G').toUpperCase()}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-sm font-bold text-gray-800">{comment.author || 'Guest'}</span>
                                <span className="text-[10px] text-gray-400">
                                    {new Date(comment.createdAt).toLocaleString(undefined, { 
                                        month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                    })}
                                </span>
                            </div>
                            
                            <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                                {comment.text}
                            </div>

                            {/* Actions (Reply / Delete) */}
                            <div className="flex items-center gap-3 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                    onClick={() => handleReply(comment.author)}
                                    className="text-[11px] text-primary-600 hover:underline font-medium cursor-pointer"
                                >
                                    回复
                                </button>
                                <button 
                                    onClick={() => onDelete(comment.id)}
                                    className="text-[11px] text-gray-400 hover:text-red-500 cursor-pointer flex items-center gap-1"
                                >
                                    删除
                                </button>
                            </div>
                        </div>
                    </div>
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Footer / Input Area */}
            <div className="p-4 border-t border-gray-100 bg-white">
                <div className="relative">
                    <textarea 
                        ref={textareaRef}
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="输入评论..."
                        className="w-full bg-white border border-primary-500/30 rounded-lg pl-3 pr-10 py-2.5 text-sm focus:ring-2 focus:ring-primary-100 focus:border-primary-500 outline-none resize-none shadow-sm transition-all"
                        rows={2}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSubmit();
                            }
                        }}
                    />
                    {/* Embedded Send Button */}
                    <Tooltip content="发送">
                        <button 
                            onClick={() => handleSubmit()}
                            disabled={!newComment.trim()}
                            className="absolute right-2 bottom-2.5 p-1.5 text-primary-600 hover:bg-primary-50 rounded-md disabled:text-gray-300 disabled:hover:bg-transparent transition-colors"
                        >
                            <ICONS.Send />
                        </button>
                    </Tooltip>
                </div>
                <div className="text-[10px] text-gray-400 mt-1.5 flex justify-end">
                    按 Enter 发送
                </div>
            </div>
        </div>
    </>
  );
};

export default CommentDialog;
