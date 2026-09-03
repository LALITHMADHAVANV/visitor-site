import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useReactToPrint } from 'react-to-print';
import { db } from '../db';
import { supabase } from '../supabaseClient';
import Badge from '../components/Badge';
import './Dashboard.css';

export default function Dashboard() {
    const badgeRef = useRef();
    const [selectedVisitor, setSelectedVisitor] = useState(null);
    const [allVisitors, setAllVisitors] = useState([]);
    const [preregisteredList, setPreregisteredList] = useState([]);
    const [loading, setLoading] = useState(true);

    const handlePrint = useReactToPrint({
        contentRef: badgeRef,
        documentTitle: selectedVisitor ? `Visitor_Badge_${selectedVisitor.id}` : 'Visitor_Badge',
    });

    const printBadge = (visitor) => {
        setSelectedVisitor(visitor);
        setTimeout(() => handlePrint(), 100);
    };

    const fetchDashboardData = useCallback(async () => {
        try {
            const [visitorsData, preregData] = await Promise.all([
                db.visitors.toArray(),
                db.preregistered.toArray()
            ]);
            setAllVisitors(visitorsData || []);
            setPreregisteredList(preregData || []);
        } catch (error) {
            console.error("Error loading dashboard data:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchDashboardData();

        // Supabase Realtime updates
        let channel;
        try {
            channel = supabase
                .channel('dashboard-realtime')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'visitors' }, () => {
                    fetchDashboardData();
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'preregistered' }, () => {
                    fetchDashboardData();
                })
                .subscribe();
        } catch (e) {
            console.error("Realtime subscription error on dashboard:", e);
        }

        // Periodic refresh every 3 seconds for live dashboard
        const interval = setInterval(fetchDashboardData, 3000);

        return () => {
            clearInterval(interval);
            if (channel) supabase.removeChannel(channel);
        };
    }, [fetchDashboardData]);

    // Computed Stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayVisitors = allVisitors.filter(v => {
        const time = v.checkInTime || v.created_at;
        if (!time) return false;
        const d = new Date(time);
        return d >= today && d < tomorrow;
    });

    const insideVisitors = allVisitors.filter(v => v.status === 'checked-in');

    const expectedToday = preregisteredList.filter(p => {
        if (!p.expectedDate) return false;
        const pDate = new Date(p.expectedDate);
        return pDate >= today && pDate < tomorrow && p.status === 'expected';
    });

    const handleCheckout = async (id) => {
        if (window.confirm(`Are you sure you want to check out visitor ${id}?`)) {
            await db.visitors.update(id, {
                status: 'checked-out',
                checkOutTime: new Date().toISOString()
            });
            fetchDashboardData();
        }
    };

    const formatTime = (isoString) => {
        if (!isoString) return '-';
        return new Date(isoString).toLocaleString([], {
            month: 'short', day: 'numeric', 
            hour: '2-digit', minute:'2-digit'
        });
    };

    return (
        <section className="view-section active">
            <div className="stats-grid">
                <div className="stat-card glass-panel">
                    <div className="stat-icon text-primary"><i className="fa-solid fa-users"></i></div>
                    <div className="stat-content">
                        <h3>Total Today</h3>
                        <p className="stat-value">{todayVisitors.length}</p>
                    </div>
                </div>
                <div className="stat-card glass-panel">
                    <div className="stat-icon text-success"><i className="fa-solid fa-user-check"></i></div>
                    <div className="stat-content">
                        <h3>Currently Inside</h3>
                        <p className="stat-value">{insideVisitors.length}</p>
                    </div>
                </div>
                <div className="stat-card glass-panel">
                    <div className="stat-icon text-warning"><i className="fa-solid fa-user-clock"></i></div>
                    <div className="stat-content">
                        <h3>Expected</h3>
                        <p className="stat-value">{expectedToday.length}</p>
                    </div>
                </div>
            </div>

            <div className="dashboard-lists glass-panel mt-4">
                <div className="section-header" style={{padding: '16px', borderBottom: '1px solid var(--border-color)'}}>
                    <h2>Active Visitors</h2>
                </div>
                <div className="table-responsive">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Name</th>
                                <th>Company</th>
                                <th>Host</th>
                                <th>Check-In Time</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {insideVisitors.length === 0 ? (
                                <tr>
                                    <td colSpan="6">
                                        <div className="empty-state">No visitors currently inside.</div>
                                    </td>
                                </tr>
                            ) : (
                                [...insideVisitors].sort((a, b) => new Date(b.checkInTime) - new Date(a.checkInTime)).map(v => (
                                    <tr key={v.id}>
                                        <td><span className="badge-id" style={{fontFamily: 'monospace', fontSize:'12px'}}>{v.id}</span></td>
                                        <td>
                                            <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                                                {v.photoData ? 
                                                    <img src={v.photoData} className="avatar-sm" alt="visitor" /> : 
                                                    <div className="avatar-placeholder">{v.name.charAt(0)}</div>
                                                }
                                                <strong>{v.name}</strong>
                                            </div>
                                        </td>
                                        <td>{v.company || '-'}</td>
                                        <td>{v.hostName}</td>
                                        <td>{formatTime(v.checkInTime)}</td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button className="btn btn-outline btn-sm" onClick={() => handleCheckout(v.id)}>
                                                    Check Out
                                                </button>
                                                <button className="btn btn-secondary btn-sm" onClick={() => printBadge(v)}>
                                                    <i className="fa-solid fa-print"></i>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            
            {/* Hidden Badge for Printing */}
            <Badge ref={badgeRef} visitor={selectedVisitor} />
        </section>
    );
}
