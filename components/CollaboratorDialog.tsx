import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { ICONS } from '../constants';
import { Tooltip } from './Tooltip';
import { debounce } from 'lodash-es';
import { toast } from 'sonner';
import ConfirmDialog from './ConfirmDialog';
import { Select } from './Select';

interface CollaboratorDialogProps {
  tableId: string;
  onClose: () => void;
}

const CollaboratorDialog: React.FC<CollaboratorDialogProps> = ({ tableId, onClose }) => {
  const [activeTab, setActiveTab] = useState<'list' | 'add'>('list');
  
  // List state
  const [collaborators, setCollaborators] = useState<any[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  // Add state
  const [roles, setRoles] = useState<{role_id: string, role_name: string}[]>([]);
  const [depts, setDepts] = useState<{dept_id: string, dept_name: string}[]>([]);
  const [collaboratorRoles, setCollaboratorRoles] = useState<{label: string, value: string}[]>([
      { value: 'READ', label: '查看' },
      { value: 'EDIT', label: '编辑' }
  ]);
  
  const [searchName, setSearchName] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  
  const [members, setMembers] = useState<any[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [assignRole, setAssignRole] = useState('READ'); // Default role to assign
  const [assigning, setAssigning] = useState(false);

  const getRole = (c: any) => c.role || (c.can_manage ? 'MANAGE' : c.can_edit ? 'EDIT' : c.can_read ? 'READ' : '');
  
  const selectableMembers = members.filter(m => !collaborators.some(c => c.account_id === m.id && getRole(c) === 'MANAGE'));
  const allSelected = selectableMembers.length > 0 && selectableMembers.every(m => selectedMembers.has(m.id));

  const toggleSelectAll = () => {
      const newSet = new Set(selectedMembers);
      if (allSelected) {
          selectableMembers.forEach(m => newSet.delete(m.id));
      } else {
          selectableMembers.forEach(m => newSet.add(m.id));
      }
      setSelectedMembers(newSet);
  };

  // Confirm delete state
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [collaboratorToDelete, setCollaboratorToDelete] = useState<string | null>(null);

  // Fetch collaborators for the selected assignRole to pre-check them
  useEffect(() => {
      if (activeTab === 'add' && assignRole) {
          api.getCollaborators(tableId, assignRole).then(res => {
              const ids = (res.data || []).map(c => c.account_id);
              setSelectedMembers(new Set(ids));
          }).catch(err => console.error('Failed to fetch collaborators for role', err));
      }
  }, [activeTab, assignRole, tableId]);

  useEffect(() => {
    fetchOptions();
  }, []);

  useEffect(() => {
    fetchCollaborators();
    fetchMembers();
  }, [activeTab]);

  const fetchCollaborators = async () => {
    setLoadingList(true);
    try {
      const res = await api.getCollaborators(tableId);
      setCollaborators(res.data || []);
    } catch (err) {
      console.error('Failed to fetch collaborators', err);
    } finally {
      setLoadingList(false);
    }
  };

  const getCollaboratorAvatar = (c: any) => {
    const member = members.find(m => m.id === c.account_id || m.account_id === c.account_id);
    const rawAvatar = c.avatar_url || c.avatar || c.avatar_path || member?.avatar || member?.avatar_url || member?.avatar_path;
    return rawAvatar ? api.getFileUrl(rawAvatar) : null;
  };

  const getMemberAvatar = (m: any) => {
    const rawAvatar = m.avatar_url || m.avatar || m.avatar_path;
    return rawAvatar ? api.getFileUrl(rawAvatar) : null;
  };

  const fetchOptions = async () => {
    try {
      const [rolesRes, deptsRes, collabRolesRes] = await Promise.all([
        api.getRoles(),
        api.getDepts(),
        api.getCollaboratorRoles()
      ]);
      setRoles(rolesRes.data || []);
      setDepts(deptsRes.data || []);
      
      const apiRoles = collabRolesRes.data || [];
      const normalizedCollabRoles: any[] = [];
      const seenValues = new Set<string>();

      // First add API roles, normalizing their labels
      for (const r of apiRoles) {
          const rawValue = String(r.value !== undefined ? r.value : r.id).toUpperCase();
          let rawLabel = r.label !== undefined ? r.label : r.name;
          
          if (rawLabel === '查看者' || rawLabel === '可阅读') rawLabel = '查看';
          if (rawLabel === '编辑者' || rawLabel === '可编辑') rawLabel = '编辑';
          
          if (rawValue === 'MANAGE') continue;

          if (!seenValues.has(rawValue)) {
              seenValues.add(rawValue);
              normalizedCollabRoles.push({ ...r, value: rawValue, label: rawLabel });
          }
      }

      // Ensure standard roles
      if (!seenValues.has('READ')) {
          normalizedCollabRoles.push({ value: 'READ', label: '查看' });
          seenValues.add('READ');
      }
      if (!seenValues.has('EDIT')) {
          normalizedCollabRoles.push({ value: 'EDIT', label: '编辑' });
          seenValues.add('EDIT');
      }

      setCollaboratorRoles(normalizedCollabRoles);
      if (normalizedCollabRoles.length > 0) {
          setAssignRole(normalizedCollabRoles[0].value);
      }
    } catch (err) {
      console.error('Failed to fetch options', err);
    }
  };

  const fetchMembers = async (name = searchName, roleId = selectedRole, deptId = selectedDept) => {
    setLoadingMembers(true);
    try {
      const res = await api.getMembers({
          name: name || undefined,
          role_ids: roleId || undefined,
          dept_ids: deptId || undefined
      });
      setMembers(res.accounts || []);
    } catch (err) {
      console.error('Failed to fetch members', err);
    } finally {
      setLoadingMembers(false);
    }
  };

  const debouncedSearch = useCallback(
    debounce((name: string, roleId: string, deptId: string) => {
      fetchMembers(name, roleId, deptId);
    }, 300),
    []
  );

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setSearchName(val);
      debouncedSearch(val, selectedRole, selectedDept);
  };

  const handleRoleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const val = e.target.value;
      setSelectedRole(val);
      fetchMembers(searchName, val, selectedDept);
  };

  const handleDeptChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const val = e.target.value;
      setSelectedDept(val);
      fetchMembers(searchName, selectedRole, val);
  };

  const toggleMemberSelection = (id: string) => {
      const newSet = new Set(selectedMembers);
      if (newSet.has(id)) {
          newSet.delete(id);
      } else {
          newSet.add(id);
      }
      setSelectedMembers(newSet);
  };

  const handleAssign = async () => {
      if (selectedMembers.size === 0) return;
      setAssigning(true);
      try {
          const payload = {
              collaborators: Array.from(selectedMembers).map(id => ({
                  account_id: id,
                  can_share: false
              })),
              role: assignRole
          };
          await api.assignCollaborators(tableId, payload);
          // Reset and go back to list
          setSelectedMembers(new Set());
          setActiveTab('list');
      } catch (err: any) {
          console.error('Failed to assign collaborators', err);
          toast.error(err.message || '分配权限失败');
      } finally {
          setAssigning(false);
      }
  };

  const handleUpdateCollaborator = async (collaboratorId: string, newRole: string, canShare: boolean) => {
      try {
          await api.updateCollaborator(tableId, collaboratorId, { role: newRole, can_share: canShare });
          fetchCollaborators(); // Refresh list
      } catch (err: any) {
          console.error('Failed to update collaborator', err);
          toast.error(err.message || '修改权限失败');
      }
  };

  const handleDeleteCollaborator = (collaboratorId: string) => {
      setCollaboratorToDelete(collaboratorId);
      setIsConfirmOpen(true);
  };

  const confirmDeleteCollaborator = async () => {
      if (!collaboratorToDelete) return;
      try {
          await api.deleteCollaborator(tableId, collaboratorToDelete);
          fetchCollaborators(); // Refresh list
          toast.success('已成功移除成员权限');
      } catch (err: any) {
          console.error('Failed to delete collaborator', err);
          toast.error(err.message || '移除成员失败');
      } finally {
          setIsConfirmOpen(false);
          setCollaboratorToDelete(null);
      }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-800">权限管理</h2>
          <Tooltip content="关闭" className="shrink-0">
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors">
              <ICONS.Close />
            </button>
          </Tooltip>
        </div>

        {/* Tabs */}
        <div className="flex px-6 border-b border-gray-100">
            <button 
                className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'list' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                onClick={() => setActiveTab('list')}
            >
                已获权限成员
            </button>
            <button 
                className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'add' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                onClick={() => setActiveTab('add')}
            >
                添加成员
            </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col bg-gray-50/50">
            {activeTab === 'list' && (
                <div className="flex-1 overflow-y-auto p-6">
                    {loadingList ? (
                        <div className="text-center text-gray-400 py-10">加载中...</div>
                    ) : collaborators.length === 0 ? (
                        <div className="text-center text-gray-400 py-10">暂无协作者</div>
                    ) : (
                        <div className="space-y-3">
                            {collaborators.map(c => {
                                const collabAvatar = getCollaboratorAvatar(c);
                                const member = members.find(m => m.id === c.account_id || m.account_id === c.account_id);
                                const displayName = c.real_name || c.account_name || member?.real_name || member?.name || member?.account_name || 'U';
                                return (
                                    <div key={c.id} className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-100 shadow-sm">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center font-bold text-sm overflow-hidden shrink-0">
                                                {collabAvatar ? (
                                                    <img src={collabAvatar} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                                                ) : (
                                                    displayName[0]?.toUpperCase() || 'U'
                                                )}
                                            </div>
                                            <div>
                                                <div className="text-sm font-medium text-gray-800">{displayName}</div>
                                                <div className="text-xs text-gray-400">添加于 {c.created_at}</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Select
                                                value={getRole(c) === 'EDITOR' ? 'EDIT' : getRole(c)}
                                                onChange={(value) => handleUpdateCollaborator(c.id, value, c.can_share)}
                                                disabled={getRole(c) === 'MANAGE'}
                                                options={
                                                    collaboratorRoles.length > 0 
                                                        ? [
                                                            ...(!collaboratorRoles.find(r => r.value === (getRole(c) === 'EDITOR' ? 'EDIT' : getRole(c))) 
                                                                ? [{ label: c.ch_role || getRole(c), value: getRole(c) }] 
                                                                : []),
                                                            ...collaboratorRoles.map(r => ({ label: r.label || r.value, value: r.value }))
                                                          ]
                                                        : [
                                                            { label: '查看', value: 'READ' },
                                                            { label: '编辑', value: 'EDIT' }
                                                          ]
                                                }
                                                className={`w-28 ${getRole(c) === 'MANAGE' ? 'opacity-70' : ''}`}
                                            />
                                            {getRole(c) !== 'MANAGE' ? (
                                    <Tooltip content="移除成员">
                                        <button 
                                            onClick={() => handleDeleteCollaborator(c.id)}
                                            className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors"
                                        >
                                            <ICONS.Trash className="w-4 h-4" />
                                        </button>
                                    </Tooltip>
                                            ) : (
                                                <div className="w-6 h-6"></div> /* Placeholder to keep alignment */
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'add' && (
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Filters */}
                    <div className="p-4 bg-white border-b border-gray-100 flex flex-col sm:flex-row gap-3 shrink-0">
                        <div className="relative flex-[2] min-w-[120px]">
                            <ICONS.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input 
                                type="text"
                                placeholder="搜索用户名..."
                                value={searchName}
                                onChange={handleSearchChange}
                                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                            />
                        </div>
                        <select 
                            value={selectedRole}
                            onChange={handleRoleChange}
                            className="flex-1 min-w-[100px] text-sm border border-gray-200 rounded-lg pl-2 pr-7 py-2 focus:outline-none focus:border-primary-500 whitespace-nowrap"
                        >
                            <option value="">所有角色</option>
                            {roles.map(r => (
                                <option key={r.role_id} value={r.role_id}>{r.role_name}</option>
                            ))}
                        </select>
                        <select 
                            value={selectedDept}
                            onChange={handleDeptChange}
                            className="flex-1 min-w-[100px] text-sm border border-gray-200 rounded-lg pl-2 pr-7 py-2 focus:outline-none focus:border-primary-500 whitespace-nowrap"
                        >
                            <option value="">所有部门</option>
                            {depts.map(d => (
                                <option key={d.dept_id} value={d.dept_id}>{d.dept_name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Select All Toggle */}
                    {members.length > 0 && (
                        <div className="px-4 py-2 bg-white border-b border-gray-100 flex items-center justify-between shrink-0">
                            <div 
                                className="flex items-center gap-2 cursor-pointer group"
                                onClick={toggleSelectAll}
                            >
                                <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${allSelected ? 'bg-primary-600 border-primary-600' : 'border-gray-300 group-hover:border-primary-400'}`}>
                                    {allSelected && <ICONS.Check className="w-3 h-3 text-white" />}
                                </div>
                                <span className="text-sm font-medium text-gray-600 group-hover:text-primary-600 transition-colors">
                                    {allSelected ? '取消全选' : '全选当前列表'}
                                </span>
                            </div>
                            <div className="text-xs text-gray-400">
                                共 {selectableMembers.length} 名可分配成员
                            </div>
                        </div>
                    )}

                    {/* Member List */}
                    <div className="flex-1 overflow-y-auto p-4">
                        {loadingMembers ? (
                            <div className="text-center text-gray-400 py-10">加载中...</div>
                        ) : members.length === 0 ? (
                            <div className="text-center text-gray-400 py-10">未找到匹配的用户</div>
                        ) : (
                            <div className="grid grid-cols-2 gap-3">
                                {members.map(m => {
                                    const isSelected = selectedMembers.has(m.id);
                                    const isManager = collaborators.some(c => c.account_id === m.id && getRole(c) === 'MANAGE');
                                    return (
                                        <div 
                                            key={m.id}
                                            onClick={() => {
                                                if (!isManager) {
                                                    toggleMemberSelection(m.id);
                                                }
                                            }}
                                            className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${isManager ? 'opacity-50 cursor-not-allowed bg-gray-50 border-gray-200' : isSelected ? 'border-primary-500 bg-primary-50 cursor-pointer' : 'border-gray-200 bg-white hover:border-primary-300 cursor-pointer'}`}
                                        >
                                            <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${isManager ? 'border-gray-300 bg-gray-200' : isSelected ? 'bg-primary-600 border-primary-600' : 'border-gray-300'}`}>
                                                {isSelected && <ICONS.Check className={`w-3 h-3 ${isManager ? 'text-gray-400' : 'text-white'}`} />}
                                            </div>
                                            <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center font-bold text-sm shrink-0 overflow-hidden">
                                                {getMemberAvatar(m) ? (
                                                    <img src={getMemberAvatar(m)!} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                                                ) : (
                                                    (m.real_name || m.name)?.[0]?.toUpperCase() || 'U'
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-sm font-medium text-gray-800 truncate">{m.real_name || m.name}</div>
                                                <div className="text-xs text-gray-400 truncate">{m.email || '无邮箱'}</div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Footer Actions */}
                    <div className="p-4 bg-white border-t border-gray-100 flex items-center justify-between shrink-0">
                        <div className="text-sm text-gray-600">
                            已选择 <span className="font-bold text-primary-600">{selectedMembers.size}</span> 名用户
                        </div>
                        <div className="flex items-center gap-3">
                            <Select 
                                value={assignRole}
                                onChange={(value) => setAssignRole(value)}
                                options={collaboratorRoles.map(r => ({ label: r.label || r.value, value: r.value }))}
                                className="w-32"
                            />
                            <button 
                                onClick={handleAssign}
                                disabled={selectedMembers.size === 0 || assigning}
                                className="px-6 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {assigning ? '分配中...' : '确认分配'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
      </div>

      <ConfirmDialog 
        isOpen={isConfirmOpen}
        title="确认移除"
        message="确定要移除该成员的权限吗？移除后该成员将无法访问此表格。"
        onConfirm={confirmDeleteCollaborator}
        onCancel={() => {
            setIsConfirmOpen(false);
            setCollaboratorToDelete(null);
        }}
      />
    </div>
  );
};

export default CollaboratorDialog;
