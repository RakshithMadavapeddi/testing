const screens = document.querySelectorAll(".screen");

function navigate(id) {
  screens.forEach(s => s.classList.remove("active"));
  document.getElementById("screen-" + id).classList.add("active");
}

document.addEventListener("click", e => {
  if (e.target.dataset.nav) {
    navigate(e.target.dataset.nav);
  }
});

// Snackbar
function showSnackbar(msg) {
  const bar = document.getElementById("snackbar");
  bar.innerText = msg;
  bar.style.display = "block";
  setTimeout(() => bar.style.display = "none", 3000);
}

// Guest validation
document.getElementById("guestNextBtn").addEventListener("click", () => {
  const required = ["fullName","street","city","state","zip","gender","age","idNumber"];
  for (let id of required) {
    if (!document.getElementById(id).value) {
      showSnackbar("Please Complete All the Required Fields.");
      return;
    }
  }
  navigate("stay");
});

// Payment simulation
document.querySelectorAll('[data-nav="processing"]').forEach(btn=>{
  btn.addEventListener("click",()=>{
    navigate("processing");
    setTimeout(()=>{
      if(Math.random()>0.3) navigate("success");
      else navigate("declined");
    },2000);
  });
});

// AAMVA Parsing
function parseAAMVA(text) {
  const fields = {};
  text.split("\n").forEach(line=>{
    const code = line.substring(0,3);
    const value = line.substring(3).trim();
    fields[code]=value;
  });
  return fields;
}

// Auto-fill
function autofill(fields) {
  document.getElementById("fullName").value =
    `${fields.DAC||""} ${fields.DAD||""} ${fields.DCS||""}`.trim();

  document.getElementById("street").value = fields.DAG||"";
  document.getElementById("city").value = fields.DAI||"";
  document.getElementById("state").value = fields.DAJ||"";
  document.getElementById("zip").value = (fields.DAK||"").substring(0,5);
  document.getElementById("idNumber").value = fields.DAQ||"";

  if(fields.DBB){
    const dob = fields.DBB;
    const year = dob.slice(0,4);
    const age = new Date().getFullYear()-year;
    document.getElementById("age").value = age;
  }

  if(fields.DBC==="1"||fields.DBC==="M") document.getElementById("gender").value="Male";
  else if(fields.DBC==="2"||fields.DBC==="F") document.getElementById("gender").value="Female";
  else document.getElementById("gender").value="Other";

  showSnackbar("Details auto-filled.");
}

// Dummy scanner simulation
document.getElementById("video")?.addEventListener("click",()=>{
  const sample=`DACJOHN
DCSDOE
DAG123 MAIN ST
DAICITY
DAJCA
DAK90210
DBC1
DBB19900101
DAQX1234567`;
  autofill(parseAAMVA(sample));
  navigate("guest-registration");
});
