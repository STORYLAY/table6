import React, { useState, useEffect } from 'react';
import { ICONS } from '../constants';
import { api } from '../services/api';

let cachedMembersPromise: Promise<any[]> | null = null;
const getCachedMembers = (): Promise<any[]> => {
    if (!cachedMembersPromise) {
        cachedMembersPromise = api.getMembers()
            .then(res => res.accounts || [])
            .catch(e => {
                console.error("Failed to load workspace members for cell rendering:", e);
                cachedMembersPromise = null;
                return [];
            });
    }
    return cachedMembersPromise;
};

const enrichUserValues = async (rawValues: any) => {
    let currentVal = rawValues;
    if (currentVal && typeof currentVal === 'object' && typeof (currentVal as any).toJSON === 'function') {
        currentVal = (currentVal as any).toJSON();
    }
    let arr = Array.isArray(currentVal) ? currentVal : (currentVal ? [currentVal] : []);
    if (typeof currentVal === 'string' && currentVal.startsWith('[')) {
        try { arr = JSON.parse(currentVal); } catch(e) {}
    }
    if (!Array.isArray(arr)) {
        arr = [arr];
    }
    const filteredArr = arr.filter(item => item !== null && item !== undefined && item !== '' && item !== '[]');
    if (filteredArr.length === 0) return [];

    const members = await getCachedMembers();
    return filteredArr.map(u => {
        const id = typeof u === 'object' && u !== null ? u.id : String(u);
        const member = members.find(m => m.id === id);
        if (member) {
            return {
                id: member.id,
                name: member.name,
                real_name: member.real_name,
                avatar: member.avatar_url || member.avatar
            };
        }
        if (typeof u === 'object' && u !== null) {
            return u;
        }
        return { id: u, name: 'User ' + u };
    });
};

export const UserCellDisplay = ({ 
    tableId, 
    rowId, 
    colId, 
    value,
    searchKeyword,
    onDelete
}: { 
    tableId: string, 
    rowId: string, 
    colId: string, 
    value: any,
    searchKeyword?: string,
    onDelete?: (index: number) => void
}) => {
    const [displayValue, setDisplayValue] = useState<any>([]);
    const [loading, setLoading] = useState(false);

    // Highlight text helper
    const highlightText = (text: any) => {
        if (text === null || text === undefined || text === '') return null;
        const str = String(text);
        if (!searchKeyword || !str.toLowerCase().includes(searchKeyword.toLowerCase())) {
            return str;
        }
        
        const parts = str.split(new RegExp(`(${searchKeyword})`, 'gi'));
        return (
            <>
                {parts.map((part, i) => 
                    part.toLowerCase() === searchKeyword.toLowerCase() ? (
                        <span key={i} className="bg-[#ffec3d] text-black rounded-[2px] box-decoration-clone">{part}</span>
                    ) : part
                )}
            </>
        );
    };

    useEffect(() => {
        const loadAndEnrich = async () => {
            setLoading(true);
            try {
                let currentVal = value;
                
                // If it's empty, we don't need to do anything
                if (!currentVal || (Array.isArray(currentVal) && currentVal.length === 0)) {
                    setDisplayValue([]);
                    setLoading(false);
                    return;
                }

                // If value doesn't have name information (not "rich"), let's first check if we should fetch from cell API.
                // Only query the server if we don't have any local/prop value (prevent race conditions during fast updates).
                const isRich = Array.isArray(currentVal)
                    ? (currentVal.length > 0 && currentVal.every(v => typeof v === 'object' && v !== null && (v.name || v.real_name)))
                    : (typeof currentVal === 'object' && currentVal !== null && (currentVal.name || currentVal.real_name));

                const hasValue = (Array.isArray(currentVal) && currentVal.length > 0) || 
                                 (typeof currentVal === 'object' && currentVal !== null && Object.keys(currentVal).length > 0) ||
                                 (typeof currentVal === 'string' && currentVal !== '' && currentVal !== '[]');

                if (!isRich && !hasValue && rowId !== 'new' && rowId && rowId !== 'undefined') {
                    try {
                        const res = await api.getCell(tableId, rowId, colId);
                        if (res.data && res.data.value !== undefined) {
                            let newValue = res.data.value;
                            if (typeof newValue === 'string') {
                                try {
                                    if (newValue.includes("'")) newValue = newValue.replace(/'/g, '"');
                                    newValue = JSON.parse(newValue);
                                } catch(e) {}
                            }
                            if (newValue) {
                                currentVal = newValue;
                            }
                        }
                    } catch (e) {
                        console.error('Failed to fetch user display info', e);
                    }
                }

                // Now enrich currentVal (whether it came from props or from getCell API)
                const enriched = await enrichUserValues(currentVal);
                setDisplayValue(enriched);
            } catch (err) {
                console.error("Failed in loadAndEnrich of UserCellDisplay", err);
            }
            setLoading(false);
        };

        loadAndEnrich();
    }, [tableId, rowId, colId, value]);

    const users = Array.isArray(displayValue) ? displayValue : (displayValue ? [displayValue] : []);

    return (
        <div className="flex items-center gap-1 overflow-hidden h-full">
            {users.map((u: any, i: number) => (
                <div key={i} className="flex items-center gap-1 bg-primary-50 text-primary-700 px-1.5 py-0.5 rounded-full text-[10px] border border-primary-100 shrink-0 group">
                    <div className="w-3.5 h-3.5 rounded-full bg-primary-200 flex items-center justify-center overflow-hidden text-[8px]">
                        {(u.avatar_url || u.avatar) ? <img src={u.avatar_url || u.avatar} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" /> : ((u.real_name || u.name)?.[0] || 'U')}
                    </div>
                    <span className="truncate max-w-[120px]">{highlightText(u.real_name || u.name || (typeof u === 'string' ? u : 'User'))}</span>
                    {onDelete && (
                        <button 
                            className="text-gray-400 hover:text-gray-600 ml-0.5"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete(i);
                            }}
                        >
                            <ICONS.Close className="w-2.5 h-2.5" />
                        </button>
                    )}
                </div>
            ))}
            {users.length === 0 && !loading && <span className="text-gray-300 text-xs">选择人员</span>}
            {loading && <div className="w-3 h-3 border-2 border-primary-500 border-t-transparent rounded-full animate-spin ml-1" />}
        </div>
    );
};
