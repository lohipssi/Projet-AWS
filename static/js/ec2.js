// Variables globales
let instances = [];

// Charger les instances au chargement de la page
document.addEventListener('DOMContentLoaded', function() {
    loadInstances();
});

// Charger les instances EC2
async function loadInstances() {
    try {
        document.getElementById('loadingInstances').style.display = 'block';
        document.getElementById('instancesTable').style.display = 'none';
        document.getElementById('noInstances').style.display = 'none';
        
        const response = await fetch('/api/ec2/instances');
        const data = await response.json();
        
        if (data.error) {
            showAlert('Erreur: ' + data.error, 'danger');
            return;
        }
        
        instances = data.instances;
        displayInstances();
        updateStats();
        
    } catch (error) {
        showAlert('Erreur de connexion: ' + error.message, 'danger');
    } finally {
        document.getElementById('loadingInstances').style.display = 'none';
    }
}

// Afficher les instances
function displayInstances() {
    const tbody = document.getElementById('instancesTableBody');
    tbody.innerHTML = '';
    
    if (instances.length === 0) {
        document.getElementById('noInstances').style.display = 'block';
        return;
    }
    
    document.getElementById('instancesTable').style.display = 'block';
    
    instances.forEach(instance => {
        const row = document.createElement('tr');
        
        const stateClass = getStateClass(instance.state);
        const actions = getInstanceActions(instance);
        
        row.innerHTML = `
            <td><strong>${instance.name}</strong></td>
            <td><code>${instance.id}</code></td>
            <td>${instance.type}</td>
            <td><span class="badge ${stateClass}">${instance.state}</span></td>
            <td>${instance.public_ip}</td>
            <td>${instance.private_ip}</td>
            <td>${instance.availability_zone}</td>
            <td>${instance.launch_time}</td>
            <td>${actions}</td>
        `;
        
        tbody.appendChild(row);
    });
}

// Obtenir la classe CSS pour l'état
function getStateClass(state) {
    switch (state) {
        case 'running': return 'bg-success';
        case 'stopped': return 'bg-secondary';
        case 'pending': return 'bg-warning';
        case 'stopping': return 'bg-warning';
        case 'starting': return 'bg-info';
        case 'terminated': return 'bg-danger';
        default: return 'bg-secondary';
    }
}

// Obtenir les actions disponibles
function getInstanceActions(instance) {
    const id = instance.id;
    let actions = '';
    
    if (instance.state === 'running') {
        actions += `<button class="btn btn-warning btn-sm me-1" onclick="stopInstance('${id}')">
                        <i class="fas fa-stop"></i>
                    </button>`;
    } else if (instance.state === 'stopped') {
        actions += `<button class="btn btn-success btn-sm me-1" onclick="startInstance('${id}')">
                        <i class="fas fa-play"></i>
                    </button>`;
    }
    
    return actions;
}

// Mettre à jour les statistiques
function updateStats() {
    const stats = {
        running: instances.filter(i => i.state === 'running').length,
        stopped: instances.filter(i => i.state === 'stopped').length,
        pending: instances.filter(i => ['pending', 'stopping', 'starting'].includes(i.state)).length,
        total: instances.length
    };
    
    document.getElementById('runningCount').textContent = stats.running;
    document.getElementById('stoppedCount').textContent = stats.stopped;
    document.getElementById('pendingCount').textContent = stats.pending;
    document.getElementById('totalCount').textContent = stats.total;
}

// Lancer une nouvelle instance
async function launchInstance() {
    const form = document.getElementById('launchInstanceForm');
    const formData = new FormData(form);
    
    const data = {
        name: document.getElementById('instanceName').value,
        instance_type: document.getElementById('instanceType').value,
        ami_id: document.getElementById('amiId').value || 'ami-0c02fb55956c7d316',
        key_name: document.getElementById('keyName').value
    };
    
    try {
        const response = await fetch('/api/ec2/launch', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert(result.message, 'success');
            bootstrap.Modal.getInstance(document.getElementById('launchInstanceModal')).hide();
            form.reset();
            setTimeout(loadInstances, 2000);
        } else {
            showAlert(result.error, 'danger');
        }
        
    } catch (error) {
        showAlert('Erreur: ' + error.message, 'danger');
    }
}

// Arrêter une instance
async function stopInstance(instanceId) {
    if (!confirm('Êtes-vous sûr de vouloir arrêter cette instance ?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/ec2/stop/${instanceId}`, {
            method: 'POST'
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert(result.message, 'success');
            loadInstances();
        } else {
            showAlert(result.error, 'danger');
        }
        
    } catch (error) {
        showAlert('Erreur: ' + error.message, 'danger');
    }
}

// Démarrer une instance
async function startInstance(instanceId) {
    try {
        const response = await fetch(`/api/ec2/start/${instanceId}`, {
            method: 'POST'
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert(result.message, 'success');
            loadInstances();
        } else {
            showAlert(result.error, 'danger');
        }
        
    } catch (error) {
        showAlert('Erreur: ' + error.message, 'danger');
    }
}
