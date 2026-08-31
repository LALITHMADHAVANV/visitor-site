import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useNavigate } from 'react-router-dom';

export default function PreRegister() {
    const [formData, setFormData] = useState({
        name: '',
        company: '',
        hostName: '',
        expectedDate: '',
        purpose: ''
    });
    
    const navigate = useNavigate();

    const preregistered = useLiveQuery(
        () => db.preregistered.where('status').equals('expected').toArray(),
        []
    ) || [];

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        try {
            await db.preregistered.add({
                ...formData,
                status: 'expected'
            });
            
            setFormData({ name: '', company: '', hostName: '', expectedDate: '', purpose: '' });
            alert("Visitor pre-registered successfully!");
        } catch (error) {
            console.error("Error pre-registering:", error);
            alert("Failed to pre-register visitor.");
        }
    };

    const handleCheckIn = (p) => {
        // You would typically pass data via state or a global store, 
        // but for simplicity we'll just navigate to register and let the user fill the form
        // A more advanced solution would pre-fill the form fields.
        navigate('/register', { state: { preregData: p } });
    };

    const formatTime = (isoString) => {
        if (!isoString) return '-';
        return new Date(isoString).toLocaleDateString([], {
            month: 'short', day: 'numeric', year: 'numeric'
        });
    };

    return (
        <section className="view-section active">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '24px' }}>
                {/* List Side */}
                <div className="glass-panel" style={{ padding: '0' }}>
                    <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)' }}>
                        <h2>Expected Visitors</h2>
                    </div>
                    <div className="table-responsive">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Date</th>
                                    <th>Host</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {preregistered.length === 0 ? (
                                    <tr>
                                        <td colSpan="4">
                                            <div className="empty-state">No expected visitors.</div>
                                        </td>
                                    </tr>
                                ) : (
                                    preregistered.map(p => (
                                        <tr key={p.id}>
                                            <td><strong>{p.name}</strong><br/><span style={{fontSize:'12px', color:'var(--text-secondary)'}}>{p.company || '-'}</span></td>
                                            <td>{formatTime(p.expectedDate)}</td>
                                            <td>{p.hostName}</td>
                                            <td>
                                                <button className="btn btn-outline btn-sm" onClick={() => handleCheckIn(p)}>Check In</button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
                
                {/* Form Side */}
                <div className="glass-panel" style={{ padding: '24px' }}>
                    <h2>Add Expected Visitor</h2>
                    <form onSubmit={handleSubmit} style={{ marginTop: '16px' }}>
                        <div className="form-group">
                            <label>Full Name *</label>
                            <input type="text" name="name" required value={formData.name} onChange={handleChange} className="form-control" />
                        </div>
                        <div className="form-group">
                            <label>Company</label>
                            <input type="text" name="company" value={formData.company} onChange={handleChange} className="form-control" />
                        </div>
                        <div className="form-group">
                            <label>Host *</label>
                            <input type="text" name="hostName" required value={formData.hostName} onChange={handleChange} className="form-control" />
                        </div>
                        <div className="form-group">
                            <label>Expected Date *</label>
                            <input type="date" name="expectedDate" required value={formData.expectedDate} onChange={handleChange} className="form-control" style={{ colorScheme: 'dark' }} />
                        </div>
                        <div className="form-group">
                            <label>Purpose</label>
                            <input type="text" name="purpose" value={formData.purpose} onChange={handleChange} className="form-control" />
                        </div>
                        <div className="form-actions mt-3">
                            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>Pre-Register</button>
                        </div>
                    </form>
                </div>
            </div>
        </section>
    );
}
