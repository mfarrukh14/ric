import { useEffect, useState } from 'react';
import {
    listDepartments,
    listCommittees,
    listUsers,
    createDepartment,
    createCommittee,
    createUser,
    deleteDepartment,
    deleteCommittee,
    deleteUser,
    resetUserPassword,
    revealUserPassword,
    updateHodStatus,
    updateEprocStatus,
} from '../../config/api';
import UserListModal, { CopyButton } from '../modals/UserListModal';
import DemandManagement from './DemandManagement';
import GrievanceDeadlineManagement from './GrievanceDeadlineManagement';
import SecurityManagement from './SecurityManagement';
import UnifiedItemManagement from './UnifiedItemManagement';
import AuditManagement from './AuditManagement';
import { UserPlus, Trash, Eye, Plus } from '@phosphor-icons/react';
import { useRouteTab } from '../../lib/useRouteTab';
import { ADMIN_TABS } from '../../app/navigation';
import { Button, Modal, Notice, PageHeader, Panel } from '../../ui';
import { confirmDialog } from '../../lib/confirm';
import { toast } from '../../lib/notify';
import './admin.css';

const ADMIN_PAGES = {
    management: 'People & teams',
    items: 'Item catalogue',
    demands: 'Demands',
    grievances: 'Grievance deadlines',
    security: 'Security',
    audit: 'Audit trail',
};

const EMPTY_USER = { name: '', designation: '', departmentId: '', committeeId: '', eligibleForDemandCreation: false, isHod: false, isFinanceUser: false };

const fail = (err, fallback) => toast.error(err?.error || err?.message || fallback);

function GroupTable({ title, type, groups, memberCount, onAdd, onAddMember, onView, onDelete }) {
    const noun = type === 'department' ? 'department' : 'committee';
    return (
        <Panel title={title} actions={<Button size="sm" variant="primary" icon={<Plus size={15} weight="bold" />} onClick={onAdd}>Add {noun}</Button>} flush>
            <table className="admin-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th className="admin-table__num">Members</th>
                        <th className="admin-table__actions"><span className="visually-hidden">Actions</span></th>
                    </tr>
                </thead>
                <tbody>
                    {groups.length === 0 ? (
                        <tr><td colSpan="3" className="admin-table__empty">No {noun}s yet</td></tr>
                    ) : (
                        groups.map((group) => (
                            <tr key={group.id}>
                                <td className="admin-table__name">{group.name}</td>
                                <td className="admin-table__num numeric">{memberCount(group.id)}</td>
                                <td className="admin-table__actions">
                                    <Button size="sm" variant="ghost" icon={<UserPlus size={16} />} aria-label="Add member" title="Add member" onClick={() => onAddMember(group.id)} />
                                    <Button size="sm" variant="ghost" icon={<Eye size={16} />} aria-label="View members" title="View members" onClick={() => onView(group.id)} />
                                    <Button size="sm" variant="ghost" className="admin-danger" icon={<Trash size={16} />} aria-label={`Delete ${noun}`} title={`Delete ${noun}`} onClick={() => onDelete(group)} />
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </Panel>
    );
}

const AdminDashboard = () => {
    const [departments, setDepartments] = useState([]);
    const [committees, setCommittees] = useState([]);
    const [users, setUsers] = useState([]);
    const [activeTab] = useRouteTab(ADMIN_TABS, 'management');

    const [groupModal, setGroupModal] = useState(null); // 'department' | 'committee' | null
    const [newName, setNewName] = useState('');
    const [showUserModal, setShowUserModal] = useState(false);
    const [newUser, setNewUser] = useState(EMPTY_USER);
    const [createdCredentials, setCreatedCredentials] = useState(null);
    const [selectedGroup, setSelectedGroup] = useState(null); // { id, type }
    const [searchTerm, setSearchTerm] = useState('');

    const fetchAll = async () => {
        try {
            const [d, c, u] = await Promise.all([listDepartments(), listCommittees(), listUsers()]);
            setDepartments(d);
            setCommittees(c);
            setUsers(u);
        } catch (err) {
            fail(err, 'Failed to load people and teams');
        }
    };

    useEffect(() => { fetchAll(); }, []);

    const membersOf = (id, type) => users.filter((u) => (type === 'department' ? u.department_id : u.committee_id) === id);
    const departmentHasHod = (departmentId) => Boolean(departmentId) && users.some((u) => u.department_id === Number(departmentId) && u.is_hod);

    // ── Departments and committees ──
    const handleCreateGroup = async (e) => {
        e.preventDefault();
        const name = newName.trim();
        if (!name) return;
        try {
            await (groupModal === 'department' ? createDepartment(name) : createCommittee(name));
            setNewName('');
            setGroupModal(null);
            fetchAll();
        } catch (err) {
            fail(err, `Failed to create ${groupModal}`);
        }
    };

    const handleDeleteGroup = async (type, group) => {
        if (!(await confirmDialog(`Delete ${group.name}?`))) return;
        try {
            await (type === 'department' ? deleteDepartment(group.id) : deleteCommittee(group.id));
            fetchAll();
        } catch (err) {
            fail(err, `Failed to delete ${type}`);
        }
    };

    // ── Users ──
    const openUserModal = (group) => {
        setNewUser({ ...EMPTY_USER, ...group });
        setShowUserModal(true);
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        if (!newUser.name.trim() || !newUser.designation.trim() || (!newUser.departmentId && !newUser.committeeId)) {
            toast.warning('Name, designation and a department or committee are required');
            return;
        }
        try {
            const { credentials } = await createUser(newUser);
            setCreatedCredentials(credentials);
            setShowUserModal(false);
            fetchAll();
        } catch (err) {
            fail(err, 'Failed to create user');
        }
    };

    const handleRemoveUser = async (_type, id, name) => {
        if (!(await confirmDialog(`Remove ${name}?`, { confirmLabel: 'Remove' }))) return;
        try {
            await deleteUser(id);
            fetchAll();
        } catch (err) {
            fail(err, 'Failed to remove user');
        }
    };

    const handleRevealPassword = async (user) => {
        try {
            const { password } = await revealUserPassword(user.id);
            return password;
        } catch (err) {
            fail(err, 'Failed to load password');
            return undefined;
        }
    };

    const handleResetPassword = async (user) => {
        if (!(await confirmDialog(`Reset password for ${user.name}?`, { confirmLabel: 'Reset' }))) return null;
        try {
            const { credentials } = await resetUserPassword(user.id);
            return credentials;
        } catch (err) {
            fail(err, 'Failed to reset password');
            return null;
        }
    };

    const handleToggleHod = async (userId, isHod) => {
        try {
            await updateHodStatus(userId, isHod);
            fetchAll();
        } catch (err) {
            fail(err, 'Failed to update HOD status');
        }
    };

    const handleToggleEproc = async (userId, isEprocUser) => {
        try {
            await updateEprocStatus(userId, isEprocUser);
            fetchAll();
        } catch (err) {
            fail(err, 'Failed to update access');
        }
    };

    const groupName = selectedGroup
        ? (selectedGroup.type === 'department' ? departments : committees).find((g) => g.id === selectedGroup.id)?.name
        : '';
    const visibleMembers = selectedGroup
        ? membersOf(selectedGroup.id, selectedGroup.type).filter((u) => u.name.toLowerCase().includes(searchTerm.toLowerCase()))
        : [];
    const viewGroup = (type) => (id) => {
        setSelectedGroup({ id, type });
        setSearchTerm('');
    };
    const hodTaken = departmentHasHod(newUser.departmentId);

    return (
        <div className="admin">
            <PageHeader title={ADMIN_PAGES[activeTab] || ADMIN_PAGES.management} />

            {createdCredentials && (
                <Notice tone="success" actions={<Button size="sm" onClick={() => setCreatedCredentials(null)}>Done</Button>}>
                    <strong>Account created.</strong> Username <code className="admin-code">{createdCredentials.username}</code>
                    <CopyButton text={createdCredentials.username} label="Copy username" />
                    password <code className="admin-code">{createdCredentials.password}</code>
                    <CopyButton text={createdCredentials.password} label="Copy password" />
                </Notice>
            )}

            {activeTab === 'management' && (
                <div className="admin-grid stagger">
                    <GroupTable
                        title="Departments"
                        type="department"
                        groups={departments}
                        memberCount={(id) => membersOf(id, 'department').length}
                        onAdd={() => setGroupModal('department')}
                        onAddMember={(id) => openUserModal({ departmentId: String(id) })}
                        onView={viewGroup('department')}
                        onDelete={(group) => handleDeleteGroup('department', group)}
                    />
                    <GroupTable
                        title="Committees"
                        type="committee"
                        groups={committees}
                        memberCount={(id) => membersOf(id, 'committee').length}
                        onAdd={() => setGroupModal('committee')}
                        onAddMember={(id) => openUserModal({ committeeId: String(id) })}
                        onView={viewGroup('committee')}
                        onDelete={(group) => handleDeleteGroup('committee', group)}
                    />
                </div>
            )}

            {activeTab === 'items' && <UnifiedItemManagement />}
            {activeTab === 'demands' && <DemandManagement embedded />}
            {activeTab === 'grievances' && <GrievanceDeadlineManagement />}
            {activeTab === 'security' && <SecurityManagement />}
            {activeTab === 'audit' && <AuditManagement />}

            <UserListModal
                show={Boolean(selectedGroup)}
                onClose={() => setSelectedGroup(null)}
                title={groupName}
                users={visibleMembers}
                searchTerm={searchTerm}
                onSearchChange={(e) => setSearchTerm(e.target.value)}
                onDelete={handleRemoveUser}
                onToggleHod={handleToggleHod}
                onToggleEproc={handleToggleEproc}
                onRevealPassword={handleRevealPassword}
                onResetPassword={handleResetPassword}
            />

            <Modal
                show={Boolean(groupModal)}
                onClose={() => setGroupModal(null)}
                title={groupModal === 'department' ? 'Add department' : 'Add committee'}
                size="sm"
                footer={<Button variant="primary" type="submit" form="admin-group-form">Create</Button>}
            >
                <form id="admin-group-form" className="admin-form" onSubmit={handleCreateGroup}>
                    <label className="ui-field">
                        <span className="ui-label">Name</span>
                        <input className="ui-input" value={newName} onChange={(e) => setNewName(e.target.value)} required />
                    </label>
                </form>
            </Modal>

            <Modal
                show={showUserModal}
                onClose={() => setShowUserModal(false)}
                title="Add user"
                footer={<Button variant="primary" type="submit" form="admin-user-form">Add user</Button>}
            >
                <form id="admin-user-form" className="admin-form" onSubmit={handleCreateUser}>
                    <label className="ui-field">
                        <span className="ui-label">Full name</span>
                        <input className="ui-input" value={newUser.name} onChange={(e) => setNewUser((u) => ({ ...u, name: e.target.value }))} required />
                    </label>
                    <label className="ui-field">
                        <span className="ui-label">Designation</span>
                        <input className="ui-input" value={newUser.designation} onChange={(e) => setNewUser((u) => ({ ...u, designation: e.target.value }))} required />
                    </label>
                    <div className="admin-form__row">
                        <label className="ui-field">
                            <span className="ui-label">Department</span>
                            <select
                                className="ui-input"
                                value={newUser.departmentId}
                                onChange={(e) => {
                                    const departmentId = e.target.value;
                                    setNewUser((u) => ({ ...u, departmentId, committeeId: '', isHod: departmentHasHod(departmentId) ? false : u.isHod }));
                                }}
                            >
                                <option value="">—</option>
                                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                        </label>
                        <label className="ui-field">
                            <span className="ui-label">or committee</span>
                            <select
                                className="ui-input"
                                value={newUser.committeeId}
                                onChange={(e) => setNewUser((u) => ({ ...u, committeeId: e.target.value, departmentId: '', isHod: false }))}
                            >
                                <option value="">—</option>
                                {committees.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </label>
                    </div>
                    <label className="admin-check">
                        <input type="checkbox" checked={newUser.eligibleForDemandCreation} onChange={(e) => setNewUser((u) => ({ ...u, eligibleForDemandCreation: e.target.checked }))} />
                        Can create demands
                    </label>
                    <label className="admin-check">
                        <input type="checkbox" checked={!newUser.isFinanceUser} onChange={(e) => setNewUser((u) => ({ ...u, isFinanceUser: !e.target.checked }))} />
                        eProcurement access <span className="ui-hint">(off = Finance only)</span>
                    </label>
                    {newUser.departmentId && (
                        <label className="admin-check">
                            <input type="checkbox" checked={newUser.isHod} disabled={hodTaken} onChange={(e) => setNewUser((u) => ({ ...u, isHod: e.target.checked }))} />
                            Head of department {hodTaken && <span className="ui-hint">(already assigned)</span>}
                        </label>
                    )}
                </form>
            </Modal>
        </div>
    );
};

export default AdminDashboard;
