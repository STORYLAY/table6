import React, { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../services/api';
import { ICONS } from '../constants';

export const UserSelector = ({
    value,
    onChange,
    onClose,
    multi = true,
    publicMode = false,
    className = "absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 shadow-xl rounded-lg z-[100] flex flex-col overflow-hidden"
}: {
    value: any,
    onChange: (val: any) => void,
    onClose: () => void,
    multi?: boolean,
    publicMode?: boolean,
    className?: string
}) => {
    const [members, setMembers] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [keyword, setKeyword] = useState('');
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (listRef.current && highlightedIndex >= 0) {
            const element = listRef.current.children[highlightedIndex] as HTMLElement;
            if (element) {
                element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
    }, [highlightedIndex]);

    // Normalize value to array of objects for internal UI display
    const selectedUsers = useMemo(() => {
        let arr = Array.isArray(value) ? value : (value ? [value] : []);
        if (typeof value === 'string' && value.startsWith('[')) {
            try { arr = JSON.parse(value); } catch(e) {}
        }
        return arr.filter(u => u !== null && u !== undefined && u !== '' && u !== '[]').map(u => {
            if (typeof u === 'object' && u !== null) return u;
            return { id: u, name: 'User ' + u };
        });
    }, [value]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
            setHighlightedIndex(prev => Math.min(prev + 1, members.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
            setHighlightedIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
            const member = members[highlightedIndex];
            if (member) {
                toggleUser(member);
                if (!multi) onClose();
            }
        } else if (e.key === 'Escape') {
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
            onClose();
        }
    };

    useEffect(() => {
        setHighlightedIndex(0);
    }, [keyword, members]);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                if (publicMode) {
                    const res = await api.getPublicUserInfo({ name: keyword, keyword });
                    setMembers(res.accounts || res.data || (Array.isArray(res) ? res : []));
                } else {
                    const res = await api.getMembers({ name: keyword });
                    setMembers(res.accounts || []);
                }
            } catch(e) { console.error(e); }
            setLoading(false);
        };
        const timer = setTimeout(load, 300);
        return () => clearTimeout(timer);
    }, [keyword, publicMode]);

    const toggleUser = (user: any) => {
        const exists = selectedUsers.find((u: any) => u.id === user.id);
        let newValue;
        if (multi) {
            if (exists) {
                newValue = selectedUsers.filter((u: any) => u.id !== user.id);
            } else {
                newValue = [...selectedUsers, { id: user.id, name: user.name, real_name: user.real_name }];
            }
        } else {
            if (exists) {
                newValue = [];
            } else {
                newValue = [{ id: user.id, name: user.name, real_name: user.real_name }];
            }
        }
        onChange(newValue);
    };

    return (
        <div 
            className={className}
            onClick={(e) => e.stopPropagation()}
            data-modal-portal="true"
        >
            <div className="p-2 border-b border-gray-100">
                <input 
                    className="w-full text-xs px-2 py-1 bg-gray-50 border border-gray-200 rounded outline-none focus:border-primary-500"
                    placeholder="搜索成员..."
                    value={keyword}
                    onChange={e => setKeyword(e.target.value)}
                    onKeyDown={handleKeyDown}
                    autoFocus
                />
            </div>
            <div ref={listRef} className="max-h-48 overflow-y-auto custom-scrollbar">
                {loading ? <div className="p-2 text-center text-gray-400 text-xs">加载中...</div> : (
                    members.length > 0 ? members.map((m, idx) => {
                        const isSel = selectedUsers.some((u: any) => u.id === m.id);
                        const isHighlighted = highlightedIndex === idx;
                        return (
                            <div 
                                key={m.id} 
                                className={`flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm ${isSel ? 'bg-primary-50' : isHighlighted ? 'bg-gray-100' : ''}`}
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
