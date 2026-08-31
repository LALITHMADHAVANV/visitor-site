import React from 'react';
import './Badge.css';

const Badge = React.forwardRef(({ visitor }, ref) => {
    if (!visitor) return null;

    return (
        <div className="badge-print-container" ref={ref}>
            <div className="badge-card">
                <div className="badge-header">
                    <div className="badge-brand">
                        <i className="fa-solid fa-shield-halved"></i>
                        <span>VMS Pro</span>
                    </div>
                    <span className="badge-title">VISITOR</span>
                </div>
                
                <div className="badge-body">
                    <div className="badge-photo-container">
                        {visitor.photoData ? (
                            <img src={visitor.photoData} alt="Visitor" className="badge-photo" />
                        ) : (
                            <div className="badge-photo-placeholder">
                                {visitor.name.charAt(0)}
                            </div>
                        )}
                    </div>
                    
                    <div className="badge-details">
                        <h2 className="visitor-name">{visitor.name}</h2>
                        {visitor.company && <p className="visitor-company">{visitor.company}</p>}
                        
                        <div className="host-info">
                            <span className="label">Visiting:</span>
                            <span className="value">{visitor.hostName}</span>
                        </div>
                        
                        <div className="date-info">
                            <span className="label">Date:</span>
                            <span className="value">
                                {new Date(visitor.checkInTime).toLocaleDateString()}
                            </span>
                        </div>
                    </div>
                </div>
                
                <div className="badge-footer">
                    <span className="badge-id">{visitor.id}</span>
                </div>
            </div>
        </div>
    );
});

export default Badge;
