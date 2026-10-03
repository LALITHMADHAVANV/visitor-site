import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../db';
import { useNavigate } from 'react-router-dom';
import { OFFICE_HOSTS } from '../hosts';

export default function PreRegister() {
    const [formData, setFormData] = useState({
        name: '',
        company: '',
        hostName: '',
        expectedDate: '',
        purpose: ''
    });
    const [preregisteredList, setPreregisteredList] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [submitting, setSubmitting] = useState(false);
    
    const navigate = useNavigate();

    const fetchPreregistered = async () => {
        try {
            const data = await db.preregistered.toArray();
            setPreregisteredList(data || []);
        } catch (error) {
            console.error("Error loading preregistered visitors:", error);
        }
    };

    useEffect(() => {
        fetchPreregistered();
        const interval = setInterval(fetchPreregistered, 3000);
        return () => clearInterval(interval);
    }, []);

    const preregistered = useMemo(() => {
        const expected = preregisteredList.filter(p => p.status === 'expected');
        if (!searchTerm.trim()) return expected;
        const term = searchTerm.toLowerCase().trim();
        return expected.filter(p => 
            p.name?.toLowerCase().includes(term) ||
            p.company?.toLowerCase().includes(term) ||
            p.hostName?.toLowerCase().includes(term)
        );
    }, [preregisteredList, searchTerm]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        
        try {
            await db.preregistered.add({
                ...formData,
                status: 'expected',
                created_at: new Date().toISOString()
            });
            
            setFormData({ name: '', company: '', hostName: '', expectedDate: '', purpose: '' });
            await fetchPreregistered();
            alert("Visitor pre-registered successfully!");
        } catch (error) {
            console.error("Error pre-registering:", error);
            alert("Failed to pre-register visitor.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleCheckIn = (p) => {
        navigate('/register', { state: { preregData: p } });
    };

    const formatExpectedDate = (isoString) => {
        if (!isoString) return '-';
        return new Date(isoString).toLocaleDateString([], {
            month: 'short', day: 'numeric', year: 'numeric'
        });
    };

    return (
        <section className="preregister-page">
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 380px', gap: '24px', alignItems: 'start' }}>
                {/* List Side */}
                <div className="glass-panel" style={{ background: '#ffffff', borderRadius: '12px', overflow: 'hidden' }}>
                    <div style={{ 
                        padding: '16px 20px', 
                        borderBottom: '1px solid var(--border-subtle)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '12px'
                    }}>
                        <div>
                            <h2 style={{ fontSize: '16px', margin: 0 }}>Expected Visitors Queue</h2>
                            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                {preregistered.length} {preregistered.length === 1 ? 'guest' : 'guests'} awaiting check-in
                            </span>
                        </div>
                        
                        {/* Search input */}
                        <div style={{ position: 'relative', width: '220px' }}>
                            <i className="fa-solid fa-search" style={{ 
                                position: 'absolute', 
                                left: '10px', 
                                top: '50%', 
                                transform: 'translateY(-50%)', 
                                color: 'var(--text-muted)', 
                                fontSize: '12px' 
                            }}></i>
                            <input 
                                type="text"
                                placeholder="Search expected..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '6px 28px 6px 28px',
                                    fontSize: '12.5px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--border-color)',
                                    background: '#f8fafc',
                                    outline: 'none'
                                }}
                            />
                            {searchTerm && (
                                <button 
                                    onClick={() => setSearchTerm('')}
                                    style={{
                                        position: 'absolute',
                                        right: '6px',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        background: 'transparent',
                                        border: 'none',
                                        color: '#94a3b8',
                                        cursor: 'pointer',
                                        fontSize: '11px'
                                    }}
                                >
                                    <i className="fa-solid fa-xmark"></i>
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="table-responsive">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '50px', textAlign: 'center' }}>#</th>
                                    <th>Visitor Details</th>
                                    <th>Expected Date</th>
                                    <th>Person to Visit</th>
                                    <th style={{ textAlign: 'right' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {preregistered.length === 0 ? (
                                    <tr>
                                        <td colSpan="5">
                                            <div className="empty-state">
                                                <i className="fa-regular fa-calendar-check empty-state-icon"></i>
                                                <p>{searchTerm ? `No expected visitors matching "${searchTerm}"` : 'No upcoming pre-registered visitors found.'}</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    preregistered.map((p, index) => (
                                        <tr key={p.id}>
                                            <td style={{ textAlign: 'center', fontWeight: '600', color: 'var(--text-secondary)', fontSize: '12px' }}>
                                                {index + 1}
                                            </td>
                                            <td>
                                                <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{p.name}</div>
                                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{p.company || 'Individual Visitor'}</div>
                                            </td>
                                            <td>
                                                <span style={{ fontSize: '12.5px', fontWeight: '500' }}>
                                                    {formatExpectedDate(p.expectedDate)}
                                                </span>
                                            </td>
                                            <td>
                                                <div style={{ fontWeight: '500' }}>{p.hostName}</div>
                                                <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>{p.purpose || 'Official Visit'}</div>
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <button 
                                                    className="btn btn-primary btn-sm" 
                                                    onClick={() => handleCheckIn(p)}
                                                    title="Proceed to full check-in and pass creation"
                                                >
                                                    <i className="fa-solid fa-user-check"></i> Check In
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
                
                {/* Form Side */}
                <div className="glass-panel" style={{ background: '#ffffff', borderRadius: '12px', padding: '24px' }}>
                    <div style={{ marginBottom: '18px', paddingBottom: '12px', borderBottom: '1px solid var(--border-subtle)' }}>
                        <h2 style={{ fontSize: '16px', margin: '0 0 4px 0' }}>Pre-Register a Guest</h2>
                        <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: 0 }}>
                            Add upcoming visitor details in advance
                        </p>
                    </div>

                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label>Visitor Full Name *</label>
                            <input 
                                type="text" 
                                name="name" 
                                required 
                                value={formData.name} 
                                onChange={handleChange} 
                                className="form-control" 
                                placeholder="e.g. Jane Doe"
                            />
                        </div>

                        <div className="form-group">
                            <label>Company / Organization</label>
                            <input 
                                type="text" 
                                name="company" 
                                value={formData.company} 
                                onChange={handleChange} 
                                className="form-control" 
                                placeholder="e.g. ABC Textiles Ltd"
                            />
                        </div>

                        <div className="form-group">
                            <label>Person to Visit (Host) *</label>
                            <select 
                                name="hostSelect" 
                                required 
                                value={OFFICE_HOSTS.some(h => h.name === formData.hostName) ? formData.hostName : (formData.hostName ? 'other' : '')} 
                                onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === 'other') {
                                        setFormData(prev => ({ ...prev, hostName: '' }));
                                    } else {
                                        setFormData(prev => ({ ...prev, hostName: val }));
                                    }
                                }}
                                className="form-control"
                            >
                                <option value="">-- Select Host --</option>
                                {OFFICE_HOSTS.map(h => (
                                    <option key={h.name} value={h.name}>
                                        {h.name} {h.department ? `(${h.department})` : ''}
                                    </option>
                                ))}
                                <option value="other">Other (Type Name)</option>
                            </select>
                            {(!OFFICE_HOSTS.some(h => h.name === formData.hostName) || formData.hostName === '') && (
                                <input 
                                    type="text" 
                                    name="hostName" 
                                    required 
                                    value={formData.hostName} 
                                    onChange={handleChange} 
                                    placeholder="Enter host or department name" 
                                    className="form-control" 
                                    style={{ marginTop: '8px' }} 
                                />
                            )}
                        </div>

                        <div className="form-group">
                            <label>Expected Visit Date *</label>
                            <input 
                                type="date" 
                                name="expectedDate" 
                                required 
                                value={formData.expectedDate} 
                                onChange={handleChange} 
                                className="form-control" 
                            />
                        </div>

                        <div className="form-group">
                            <label>Purpose of Visit</label>
                            <input 
                                type="text" 
                                name="purpose" 
                                value={formData.purpose} 
                                onChange={handleChange} 
                                className="form-control" 
                                placeholder="e.g. Audit, Client Meeting"
                            />
                        </div>

                        <div style={{ marginTop: '20px' }}>
                            <button 
                                type="submit" 
                                className="btn btn-primary w-100" 
                                disabled={submitting}
                            >
                                {submitting ? (
                                    <>
                                        <i className="fa-solid fa-spinner fa-spin"></i>
                                        <span>Saving...</span>
                                    </>
                                ) : (
                                    <>
                                        <i className="fa-solid fa-calendar-plus"></i>
                                        <span>Add Pre-Registration</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </section>
    );
}
