// therapist-ui.js — Complete Therapist Frontend
// Include this with: <script src="/js/therapist-ui.js"></script>

const TherapistUI = (() => {

  var currentSessionUrl = null;
  var currentBookingId  = null;

  // ── LOAD THERAPIST LIST ──────────────────────────────────────────
  async function loadList() {
    var list = document.getElementById('therapistList');
    if (!list) return;

    list.innerHTML = '<div style="text-align:center;padding:40px;color:#8b9dc3"><div style="font-size:32px;margin-bottom:12px">⏳</div><div>Loading therapists...</div></div>';

    try {
      var res  = await fetch('/api/therapist/list');
      var data = await res.json();

      if (!data.therapists || data.therapists.length === 0) {
        list.innerHTML = '<div style="text-align:center;padding:40px;color:#8b9dc3">' +
          '<div style="font-size:40px;margin-bottom:12px">👨‍⚕️</div>' +
          '<div style="font-size:15px;font-weight:500;color:#f0f4ff;margin-bottom:8px">No verified therapists yet</div>' +
          '<div style="font-size:13px">Our team is reviewing applications. Check back soon.</div>' +
          '</div>';
        return;
      }

      list.innerHTML = data.therapists.map(function(t) {
        var stars = '';
        if (t.rating > 0) {
          for (var i = 0; i < Math.round(t.rating); i++) stars += '★';
          for (var j = Math.round(t.rating); j < 5; j++) stars += '☆';
        }
        var specs = (t.specializations || []).join(' · ') || 'General wellness';
        return '<div style="background:rgba(255,255,255,0.05);border:0.5px solid rgba(255,255,255,0.1);border-radius:16px;padding:16px;margin-bottom:12px">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">' +
            '<div>' +
              '<div style="font-weight:600;color:#f0f4ff;font-size:16px">' + t.fullName + '</div>' +
              '<div style="font-size:12px;color:#8b9dc3;margin-top:3px">📍 ' + t.location + ' &nbsp;·&nbsp; ' + t.yearsExperience + ' years exp.</div>' +
            '</div>' +
            '<div style="text-align:right">' +
              '<div style="font-weight:700;color:#a5b4fc;font-size:18px">K' + t.sessionPrice + '</div>' +
              '<div style="font-size:11px;color:#8b9dc3">per session</div>' +
            '</div>' +
          '</div>' +
          '<div style="font-size:12px;color:#818cf8;margin-bottom:8px">' + specs + '</div>' +
          (t.bio ? '<div style="font-size:13px;color:#8b9dc3;line-height:1.6;margin-bottom:12px">' + t.bio + '</div>' : '') +
          '<div style="display:flex;align-items:center;justify-content:space-between">' +
            '<div style="font-size:12px;color:#f59e0b">' + (t.rating > 0 ? stars + ' (' + t.reviewCount + ')' : '⭐ New therapist') + '</div>' +
            '<button onclick="TherapistUI.openBooking(\'' + t.id + '\',\'' + t.fullName.replace(/'/g,"") + '\',\'' + t.sessionPrice + '\')" ' +
              'style="background:#6366f1;border:none;border-radius:10px;color:#fff;padding:9px 18px;font-size:13px;font-weight:500;cursor:pointer">Book Session</button>' +
          '</div>' +
        '</div>';
      }).join('');
    } catch(err) {
      list.innerHTML = '<div style="text-align:center;padding:20px;color:#f43f5e">Could not load therapists. Please try again.</div>';
    }
  }

  // ── OPEN BOOKING MODAL ───────────────────────────────────────────
  function openBooking(therapistId, name, price) {
    var token = window.api && api.getToken ? api.getToken() : null;
    if (!token) { alert('Please log in to book a session.'); return; }

    document.getElementById('bookTherapistId').value   = therapistId;
    document.getElementById('bookTherapistName').textContent = 'Book session with ' + name;
    document.getElementById('bookPrice').textContent   = 'K' + price + ' per session';
    document.getElementById('bookingAlert').textContent = '';
    document.getElementById('bookingAlert').style.display = 'none';
    document.getElementById('bookDateTime').value      = '';
    document.getElementById('bookNotes').value         = '';
    document.getElementById('therapistBookModal').style.display = 'flex';
  }

  // ── SUBMIT BOOKING ───────────────────────────────────────────────
  async function submitBooking() {
    var therapistId  = document.getElementById('bookTherapistId').value;
    var scheduledAt  = document.getElementById('bookDateTime').value;
    var notes        = document.getElementById('bookNotes').value;
    var alrt         = document.getElementById('bookingAlert');

    if (!scheduledAt) {
      alrt.textContent   = 'Please select a date and time.';
      alrt.style.display = 'block';
      alrt.style.color   = '#f43f5e';
      return;
    }

    var token = api.getToken();
    document.getElementById('bookSubmitBtn').textContent = 'Booking...';
    document.getElementById('bookSubmitBtn').disabled   = true;

    try {
      var res  = await fetch('/api/therapist/book', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body:    JSON.stringify({ therapistId: therapistId, scheduledAt: scheduledAt, notes: notes }),
      });
      var data = await res.json();

      if (res.ok) {
        currentSessionUrl = data.jitsiUrl;
        currentBookingId  = data.bookingId;
        document.getElementById('therapistBookModal').style.display = 'none';
        openSessionModal(data);
      } else {
        alrt.textContent   = data.error || 'Could not book session.';
        alrt.style.display = 'block';
        alrt.style.color   = '#f43f5e';
      }
    } catch(err) {
      alrt.textContent   = 'Network error. Please try again.';
      alrt.style.display = 'block';
      alrt.style.color   = '#f43f5e';
    }

    document.getElementById('bookSubmitBtn').textContent = 'Confirm Booking';
    document.getElementById('bookSubmitBtn').disabled   = false;
  }

  // ── SESSION MODAL ────────────────────────────────────────────────
  function openSessionModal(data) {
    document.getElementById('sessionTherapistName').textContent = data.therapistName;
    document.getElementById('sessionScheduled').textContent     = new Date(data.scheduledAt).toLocaleString();
    document.getElementById('sessionPrice').textContent         = 'K' + data.sessionPrice;
    document.getElementById('sessionRoomName').textContent      = data.roomName;
    currentSessionUrl = data.jitsiUrl;
    document.getElementById('therapistSessionModal').style.display = 'flex';
  }

  function joinSession() {
    if (currentSessionUrl) {
      window.open(currentSessionUrl, '_blank');
    }
  }

  // ── APPLY MODAL ──────────────────────────────────────────────────
  function openApply() {
    document.getElementById('therapistApplyModal').style.display = 'flex';
    document.getElementById('applyAlert').textContent = '';
    document.getElementById('applyAlert').style.display = 'none';
  }

  async function submitApply() {
    var alrt = document.getElementById('applyAlert');
    var body = {
      fullName:        document.getElementById('aFullName').value.trim(),
      email:           document.getElementById('aEmail').value.trim(),
      phone:           document.getElementById('aPhone').value.trim(),
      location:        document.getElementById('aLocation').value.trim() || 'Lusaka, Zambia',
      licenseNumber:   document.getElementById('aLicense').value.trim(),
      nrcNumber:       document.getElementById('aNRC').value.trim(),
      yearsExperience: document.getElementById('aYears').value,
      specializations: document.getElementById('aSpec').value,
      sessionPrice:    document.getElementById('aPrice').value,
      bio:             document.getElementById('aBio').value.trim(),
      reference1Name:  document.getElementById('aRef1Name').value.trim(),
      reference1Phone: document.getElementById('aRef1Phone').value.trim(),
      reference2Name:  document.getElementById('aRef2Name').value.trim(),
      reference2Phone: document.getElementById('aRef2Phone').value.trim(),
    };

    if (!body.fullName || !body.email || !body.licenseNumber || !body.nrcNumber || !body.yearsExperience) {
      alrt.textContent = 'Please fill in all required fields.';
      alrt.style.display = 'block'; alrt.style.color = '#f43f5e';
      return;
    }
    if (parseInt(body.yearsExperience) < 3) {
      alrt.textContent = 'Minimum 3 years of experience required.';
      alrt.style.display = 'block'; alrt.style.color = '#f43f5e';
      return;
    }

    document.getElementById('applySubmitBtn').textContent = 'Submitting...';
    document.getElementById('applySubmitBtn').disabled = true;

    var res  = await fetch('/api/therapist/apply', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    var data = await res.json();

    document.getElementById('applySubmitBtn').textContent = 'Submit Application';
    document.getElementById('applySubmitBtn').disabled = false;

    if (res.ok) {
      alrt.textContent = '✅ Application submitted! We will review within 2-3 business days.';
      alrt.style.display = 'block'; alrt.style.color = '#4ade80';
      setTimeout(function() {
        document.getElementById('therapistApplyModal').style.display = 'none';
      }, 3000);
    } else {
      alrt.textContent = data.error || 'Could not submit. Please try again.';
      alrt.style.display = 'block'; alrt.style.color = '#f43f5e';
    }
  }

  return { loadList, openBooking, submitBooking, joinSession, openApply, submitApply };
})();
