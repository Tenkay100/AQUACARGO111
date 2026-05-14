// Admin Dashboard Logic

const STATUSES = [
    "Pending", "Shipment Created", "Package Received", "Processing", "Packed",
    "On Hold", "In Transit", "Customs Clearance", "Customs Hold", "Arrived at Facility",
    "Departed Facility", "Out for Delivery", "Delivery Attempt Failed", "Delivered",
    "Delayed", "Returned to Sender", "Cancelled", "Awaiting Pickup", "Security Inspection",
    "Air Transit", "Sea Transit", "Warehouse Scan", "Distribution Center", "Routing Update",
    "Shipment Exception", "Destination Arrival", "Local Dispatch", "Loading Cargo",
    "Unloading Cargo", "Transit Pause", "Re-routed", "Awaiting Documents",
    "Insurance Verification", "Final Delivery Stage"
];

// Local Temporary State (removed, now handled via localStorage fallback in supabase.js)

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    // Basic Auth Check
    const token = sessionStorage.getItem('aqua_admin_token');
    if (!token) {
        window.location.href = 'admin-login.html';
        return;
    }

    populateDropdowns();
    generateTrackingCode();
    loadShipments();
    // Start chat widget (app.js is loaded before admin.js)
    if (typeof initChatWidget === 'function') initChatWidget();
});

function logout() {
    sessionStorage.removeItem('aqua_admin_token');
    window.location.href = 'admin-login.html';
}

// UI Helpers
function populateDropdowns() {
    // Populate Countries
    const countrySelects = document.querySelectorAll('.country-select');
    let countryOptions = '<option value="">Select Country</option>';
    COUNTRIES.forEach(c => {
        countryOptions += `<option value="${c}">${c}</option>`;
    });
    countrySelects.forEach(sel => sel.innerHTML = countryOptions);

    // Populate Statuses
    let statusOptions = '<option value="">Select Status</option>';
    STATUSES.forEach(s => {
        statusOptions += `<option value="${s}">${s}</option>`;
    });
    document.getElementById('create-status').innerHTML = statusOptions;
    document.getElementById('update-status').innerHTML = statusOptions;
}

function generateTrackingCode() {
    const prefix = "AC-";
    const random = Math.floor(10000000 + Math.random() * 90000000); // 8 digit random
    const code = prefix + random;
    const el = document.getElementById('create-tracking');
    if(el) el.value = code;
    return code;
}

function openModal(id) {
    const modal = document.getElementById(id);
    if(modal) {
        modal.classList.add('active');
    }
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if(modal) {
        modal.classList.remove('active');
        // If it's a form modal, optionally reset
        const form = modal.querySelector('form');
        if(form && id !== 'create-shipment-modal') form.reset();
    }
}

// Data Fetching and Rendering
async function loadShipments() {
    const tableBody = document.getElementById('shipments-table-body');
    try {
        let shipments = [];
        if (window.db && window.db.getAllShipments) {
            shipments = await window.db.getAllShipments();
        }

        updateStats(shipments);
        renderTable(shipments);

    } catch (e) {
        console.error("Error loading shipments", e);
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: #ff4d4d;">Failed to load shipments records.</td></tr>`;
    }
}

function updateStats(shipments) {
    document.getElementById('stat-total').innerText = shipments.length;
    let transit = 0, delivered = 0;
    shipments.forEach(s => {
        if(s.status.toLowerCase() === 'delivered') delivered++;
        else if(s.status.toLowerCase() !== 'pending' && s.status.toLowerCase() !== 'cancelled') transit++;
    });
    document.getElementById('stat-transit').innerText = transit;
    document.getElementById('stat-delivered').innerText = delivered;
}

function renderTable(shipments) {
    const tableBody = document.getElementById('shipments-table-body');
    if (shipments.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--text-muted);">No shipments found. Create one above.</td></tr>`;
        return;
    }

    tableBody.innerHTML = '';
    shipments.forEach(s => {
        let statusClass = 'status-transit';
        if (s.status.toLowerCase() === 'delivered') statusClass = 'status-delivered';
        if (s.status.toLowerCase() === 'pending') statusClass = 'status-pending';

        const row = `
            <tr>
                <td><strong>${s.tracking_number}</strong></td>
                <td><span class="status-badge ${statusClass}">${s.status}</span></td>
                <td>${s.origin_country || '-'}</td>
                <td>${s.destination_country || '-'}</td>
                <td>${new Date(s.created_at).toLocaleDateString()}</td>
                <td>
                    <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.8rem;" onclick="openUpdateModal('${s.id}', '${s.tracking_number}', '${s.status}')">+ Add Update</button>
                    <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.8rem; border-color: #ff4d4d; color: #ff4d4d;" onclick="handleDelete('${s.id}')">Delete</button>
                </td>
            </tr>
        `;
        tableBody.insertAdjacentHTML('beforeend', row);
    });
}

// Creating
async function submitCreateShipment() {
    const tracking = document.getElementById('create-tracking').value;
    const status = document.getElementById('create-status').value;
    if (!tracking || !status) return alert('Tracking number and initial status are required.');

    const data = {
        tracking_number: tracking,
        status: status,
        origin_country: document.getElementById('create-origin').value,
        destination_country: document.getElementById('create-destination').value,
        sender_details: document.getElementById('create-sender').value,
        receiver_details: document.getElementById('create-receiver').value,
        weight_kg: parseFloat(document.getElementById('create-weight').value) || null,
        dimensions: document.getElementById('create-dimensions').value,
        estimated_delivery_date: document.getElementById('create-est-date').value || null,
        package_details: document.getElementById('create-package-details').value,
        customer_name: document.getElementById('create-customer').value,
        receiver_name: document.getElementById('create-receiver-name').value,
        receiver_email: document.getElementById('create-receiver-email').value,
        container_number: document.getElementById('create-container').value,
        seal_number: document.getElementById('create-seal').value,
        vessel_name: document.getElementById('create-vessel').value,
        freight_charges: parseFloat(document.getElementById('create-freight').value) || 0,
        payment_terms: document.getElementById('create-payment-terms').value,
        progress_percentage: status === 'Delivered' ? 100 : (status === 'Shipment Created' ? 5 : 10)
    };

    try {
        const res = await window.db.createShipment(data);
        if (!res) {
            alert("Database Error: Could not save shipment. Please check your Supabase dashboard or console.");
            return;
        }

        // Add initial history
        await window.db.addShipmentHistory({
            shipment_id: res.id,
            location: data.origin_country || "Dispatch Center",
            status: "Shipment Created",
            description: "Electronic shipping details received and processed."
        });

        closeModal('create-shipment-modal');
        generateTrackingCode(); // prep new
        document.getElementById('create-form').reset();
        await loadShipments();

    } catch (e) {
        alert('Failed to save: ' + (e.message || e) + '\nCheck console for more details.');
        console.error("Save Shipment Error:", e);
    }
}

// Updating History
function openUpdateModal(id, trackingNo, currentStatus) {
    document.getElementById('update-shipment-id').value = id;
    document.getElementById('update-tracking-display').innerText = trackingNo;
    document.getElementById('update-status').value = currentStatus;
    
    // Auto suggest progress
    let p = 50;
    if(currentStatus.toLowerCase() === 'delivered') p = 100;
    document.getElementById('update-progress').value = p;

    openModal('update-history-modal');
}

async function submitUpdateHistory() {
    const shipmentId = document.getElementById('update-shipment-id').value;
    const newStatus = document.getElementById('update-status').value;
    const loc = document.getElementById('update-location').value;
    const details = document.getElementById('update-desc').value;
    const progress = document.getElementById('update-progress').value;

    if (!newStatus || !loc) return alert('Status and Location are required.');

    try {
        await window.db.updateShipment(shipmentId, { status: newStatus, progress_percentage: parseInt(progress) || 0 });
        
        await window.db.addShipmentHistory({
            shipment_id: shipmentId,
            location: loc,
            status: newStatus,
            description: details
        });

        closeModal('update-history-modal');
        document.getElementById('update-form').reset();
        await loadShipments();

    } catch (e) {
        alert('Failed to add update. Check console.');
        console.error(e);
    }
}

// Deleting
async function handleDelete(id) {
    if (confirm("Are you sure you want to delete this shipment?")) {
        try {
            await window.db.deleteShipment(id);
            await loadShipments();
        } catch (e) {
            console.error("Delete Error:", e);
            alert("Could not delete. Check console.");
        }
    }
}
