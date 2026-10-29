import { approvedJobs, approvedPartUsage, computeTotals, lineAmount } from "./calc";
import { DEMO_ACCOUNTS, DEMO_WORKSHOP } from "./demo";
import { uid } from "./format";
import { toPaisa } from "./money";
import type {
  AuditEntry, CannedJob, Customer, Data, Invoice, Job, Line, Part, Payment, RepairOrder, StockMovement, User,
  Vehicle, Workshop,
} from "./types";

const ago = (days: number, hours = 0) => new Date(Date.now() - (days * 24 + hours) * 3600_000).toISOString();
const ahead = (hours: number) => new Date(Date.now() + hours * 3600_000).toISOString();

export { DEMO_PASSWORD } from "./demo";

export function defaultWorkshop(input: Partial<Workshop> & { name: string }): Workshop {
  return {
    id: uid(),
    phone: "",
    email: "",
    address: "",
    city: "",
    ntn: "",
    laborRate: toPaisa(2000),
    partsTaxRate: 18,
    laborTaxRate: 0,
    invoicePrefix: "INV",
    nextInvoiceSeq: 1,
    nextRoSeq: 1001,
    printer: { paper: "80mm", footer: "Thank you for your visit!", autoPrintAfterPayment: false, baudRate: 9600 },
    createdAt: new Date().toISOString(),
    ...input,
  };
}

export function buildDemoData(): Data {
  const ws = defaultWorkshop({
    name: DEMO_WORKSHOP,
    phone: "0300-1234567",
    email: "info@alnoorauto.pk",
    address: "Plot 14, Main Boulevard, Gulberg III",
    city: "Lahore",
    ntn: "1234567-8",
    createdAt: ago(60),
  });

  const mkUser = (name: string, email: string, role: User["role"]): User => ({
    id: uid(), workshopId: ws.id, name, email, role, active: true, createdAt: ago(60),
  });
  const users = DEMO_ACCOUNTS.map((a) => mkUser(a.name, a.email, a.role));
  const [owner, advisor, tech1, tech2, cashier] = users;

  // ---- Parts -------------------------------------------------------------
  const partList: [string, string, string, string, string, string, number, number, number][] = [
    // key, part number, name, brand, category, bin, price (Rs), opening qty, min qty
    ["oil", "SH-HX7-4L", "Engine oil 5W-30 (4L)", "Shell Helix", "Oils & fluids", "A-1", 9500, 24, 6],
    ["ofCorolla", "90915-YZZE1", "Oil filter – Corolla", "Toyota Genuine", "Filters", "B-1", 1800, 15, 5],
    ["ofCivic", "15400-RTA-003", "Oil filter – Civic / City", "Honda Genuine", "Filters", "B-1", 2000, 4, 5],
    ["afCorolla", "17801-0T030", "Air filter – Corolla", "Toyota Genuine", "Filters", "B-2", 2500, 8, 3],
    ["afCivic", "17220-5BA-A00", "Air filter – Civic", "Honda Genuine", "Filters", "B-2", 2800, 6, 3],
    ["padsCorolla", "BP-0986AB", "Front brake pads – Corolla", "Bosch", "Brakes", "C-1", 6500, 7, 3],
    ["padsCivic", "BP-0986CV", "Front brake pads – Civic / City", "Bosch", "Brakes", "C-1", 7000, 2, 3],
    ["shoesMehran", "BS-MEH-01", "Rear brake shoes – Mehran / Alto", "Suzuki Genuine", "Brakes", "C-2", 2200, 10, 4],
    ["plug", "NGK-BKR6E", "Spark plug", "NGK", "Ignition", "D-1", 950, 40, 12],
    ["coolant", "CL-PRS-1L", "Coolant (1L)", "Prestone", "Oils & fluids", "A-2", 1400, 18, 6],
    ["brakeFluid", "BF-DOT4", "Brake fluid DOT4 (500ml)", "Bosch", "Oils & fluids", "A-2", 1100, 12, 4],
    ["wiper", "WB-22", "Wiper blade 22\"", "Bosch", "Accessories", "E-1", 1500, 9, 4],
    ["battery", "AGS-NS60", "Battery 12V 50Ah", "AGS", "Electrical", "F-1", 24000, 3, 2],
    ["cabin", "CF-AC-01", "AC cabin filter", "Denso", "Filters", "B-3", 1600, 7, 3],
    ["timing", "TB-MEH-88", "Timing belt – Mehran", "Gates", "Engine", "D-2", 3500, 5, 2],
    ["clutch", "CP-MEH-200", "Clutch plate – Mehran", "Exedy", "Transmission", "G-1", 6500, 3, 2],
    ["shock", "KYB-334", "Front shock absorber – Corolla", "KYB", "Suspension", "H-1", 14500, 4, 2],
    ["fanBelt", "FB-4PK", "Fan belt 4PK", "Gates", "Engine", "D-2", 1200, 11, 4],
    ["bulb", "H4-12V", "Headlight bulb H4", "Philips", "Electrical", "F-2", 900, 20, 6],
    ["gearOil", "GO-75W90", "Gear oil 75W-90 (1L)", "Castrol", "Oils & fluids", "A-3", 2100, 1, 4],
  ];
  const parts: Part[] = partList.map(([, partNumber, name, brand, category, location, price, qty, minQty]) => ({
    id: uid(), workshopId: ws.id, partNumber, name, brand, category, location,
    cost: toPaisa(Math.round(price * 0.72)), price: toPaisa(price), qtyOnHand: qty, minQty, active: true, createdAt: ago(60),
  }));
  const P: Record<string, Part> = Object.fromEntries(partList.map(([key], i) => [key, parts[i]]));

  // ---- Customers & vehicles ------------------------------------------------
  const customers: Customer[] = [];
  const vehicles: Vehicle[] = [];
  const addCustomer = (
    c: Partial<Customer> & { name: string; phone: string },
    cars: [string, string, string, string, number][],
  ) => {
    const customer: Customer = {
      id: uid(), workshopId: ws.id, kind: "individual", email: "", address: "Lahore", ntn: "", notes: "", createdAt: ago(45), ...c,
    };
    customers.push(customer);
    const vs = cars.map(([plate, make, model, year, odo]) => ({
      id: uid(), workshopId: ws.id, customerId: customer.id, plate, make, model, year, vin: "", color: "", odometer: odo, createdAt: ago(45),
    }));
    vehicles.push(...vs);
    return { customer, vehicles: vs };
  };

  const ali = addCustomer({ name: "Ali Khan", phone: "0301-5551234", email: "ali.khan@gmail.com" }, [["LEA-19-1234", "Toyota", "Corolla GLi", "2019", 84200]]);
  const sara = addCustomer({ name: "Sara Ahmed", phone: "0333-4442211" }, [["ABC-567", "Honda", "Civic Oriel", "2021", 41300]]);
  const bilalMotors = addCustomer(
    { name: "Bilal Motors (Fleet)", phone: "042-35761234", kind: "company", ntn: "7654321-0", notes: "Fleet account – monthly billing" },
    [["LES-18-8899", "Toyota", "Hilux Revo", "2018", 156000], ["LXR-4521", "Suzuki", "Mehran VX", "2016", 210400]],
  );
  const farhan = addCustomer({ name: "Farhan Malik", phone: "0321-7788990" }, [["LEC-17-7788", "Suzuki", "Cultus VXR", "2017", 98500]]);
  const zainab = addCustomer({ name: "Zainab Hussain", phone: "0345-3321456" }, [["LEH-22-3321", "Suzuki", "Alto VXL", "2022", 23800]]);
  const usama = addCustomer({ name: "Usama Sheikh", phone: "0300-9090123" }, [["LEB-20-9090", "Honda", "City Aspire", "2020", 67100]]);
  const nadia = addCustomer({ name: "Nadia Rehman", phone: "0312-2023111", email: "nadia.r@outlook.com" }, [["LEJ-23-2023", "KIA", "Sportage Alpha", "2023", 18900]]);
  addCustomer({ name: "Hassan Raza", phone: "0308-5566778" }, [["LEF-15-5566", "Toyota", "Corolla XLi", "2015", 172300]]);

  // ---- Canned jobs -----------------------------------------------------------
  const labor = (description: string, qty: number): Line => ({ id: uid(), kind: "labor", description, qty, unitPrice: ws.laborRate });
  const part = (key: string, qty: number): Line => ({ id: uid(), kind: "part", description: P[key].name, partId: P[key].id, qty, unitPrice: P[key].price });
  const fee = (description: string, rs: number): Line => ({ id: uid(), kind: "fee", description, qty: 1, unitPrice: toPaisa(rs) });
  const strip = (lines: Line[]): CannedJob["lines"] => lines.map((l) => ({ kind: l.kind, description: l.description, partId: l.partId, qty: l.qty, unitPrice: l.unitPrice }));

  const cannedJobs: CannedJob[] = [
    { id: uid(), workshopId: ws.id, title: "Oil change – Corolla", lines: strip([labor("Drain and refill engine oil, replace filter", 0.5), part("oil", 1), part("ofCorolla", 1)]) },
    { id: uid(), workshopId: ws.id, title: "Oil change – Civic / City", lines: strip([labor("Drain and refill engine oil, replace filter", 0.5), part("oil", 1), part("ofCivic", 1)]) },
    { id: uid(), workshopId: ws.id, title: "Front brake pads – Corolla", lines: strip([labor("Replace front brake pads, clean callipers", 1.5), part("padsCorolla", 1)]) },
    { id: uid(), workshopId: ws.id, title: "Engine tuning (4 cyl)", lines: strip([labor("Engine tuning, throttle body clean", 2), part("plug", 4)]) },
    { id: uid(), workshopId: ws.id, title: "AC service", lines: strip([labor("AC inspection and service", 1.5), part("cabin", 1), fee("AC gas top-up (R134a)", 3500)]) },
    { id: uid(), workshopId: ws.id, title: "Wheel alignment", lines: strip([fee("Computerised wheel alignment", 1500)]) },
  ];

  // ---- Repair orders --------------------------------------------------------
  const job = (title: string, approval: Job["approval"], lines: Line[], done = false): Job => ({ id: uid(), title, approval, lines, done });
  let roSeq = 1001;
  const mkRo = (r: Partial<RepairOrder> & Pick<RepairOrder, "customerId" | "vehicleId" | "status" | "jobs" | "concern" | "createdAt">): RepairOrder => ({
    id: uid(), workshopId: ws.id, number: roSeq++, label: "none", technicianId: null, notes: "", odometerIn: null, promisedAt: null,
    discount: 0, stockDeducted: false, invoiceId: null, createdBy: advisor.id, updatedAt: r.createdAt, completedAt: null, ...r,
  });

  const ro1 = mkRo({
    customerId: ali.customer.id, vehicleId: ali.vehicles[0].id, status: "closed", concern: "Routine oil change",
    odometerIn: 84200, technicianId: tech1.id, createdAt: ago(1, 5), completedAt: ago(1, 3), stockDeducted: true,
    jobs: [job("Oil change – Corolla", "approved", [labor("Drain and refill engine oil, replace filter", 0.5), part("oil", 1), part("ofCorolla", 1)], true)],
  });
  const ro2 = mkRo({
    customerId: bilalMotors.customer.id, vehicleId: bilalMotors.vehicles[0].id, status: "invoiced", concern: "Periodic service, brakes feel soft",
    odometerIn: 156000, technicianId: tech2.id, createdAt: ago(3), completedAt: ago(2, 20), stockDeducted: true,
    jobs: [
      job("Periodic service", "approved", [labor("Full periodic service", 2), part("oil", 2), part("coolant", 2)], true),
      job("Brake fluid flush", "approved", [labor("Flush and bleed brake system", 1), part("brakeFluid", 2)], true),
    ],
  });
  const ro3 = mkRo({
    customerId: usama.customer.id, vehicleId: usama.vehicles[0].id, status: "completed", concern: "Squeaking from front wheels when braking",
    odometerIn: 67100, technicianId: tech1.id, createdAt: ago(0, 6), completedAt: ago(0, 1), stockDeducted: true, label: "ready",
    jobs: [
      job("Front brake pads – City", "approved", [labor("Replace front brake pads, clean callipers", 1.5), part("padsCivic", 1)], true),
      job("Wiper blades", "declined", [part("wiper", 2)]),
    ],
  });
  const ro4 = mkRo({
    customerId: sara.customer.id, vehicleId: sara.vehicles[0].id, status: "in_progress", label: "waiting_parts",
    concern: "Knocking noise over bumps, AC weak", odometerIn: 41300, technicianId: tech1.id, createdAt: ago(0, 4), promisedAt: ahead(5),
    jobs: [
      job("Front suspension check & shock replacement", "approved", [labor("Replace front shock absorbers (pair)", 3), fee("Shock absorbers (sourced from market)", 31000)]),
      job("AC service", "approved", [labor("AC inspection and service", 1.5), part("cabin", 1), fee("AC gas top-up (R134a)", 3500)], true),
      job("Air filter", "declined", [part("afCivic", 1)]),
    ],
  });
  const ro5 = mkRo({
    customerId: farhan.customer.id, vehicleId: farhan.vehicles[0].id, status: "in_progress", label: "in_bay",
    concern: "Car misfiring, poor fuel average", odometerIn: 98500, technicianId: tech2.id, createdAt: ago(0, 3), promisedAt: ahead(2),
    jobs: [job("Engine tuning (4 cyl)", "approved", [labor("Engine tuning, throttle body clean", 2), part("plug", 4)])],
  });
  const ro6 = mkRo({
    customerId: nadia.customer.id, vehicleId: nadia.vehicles[0].id, status: "estimate", concern: "AC not cooling, check engine light on",
    odometerIn: 18900, createdAt: ago(0, 2), promisedAt: ahead(28),
    jobs: [
      job("AC service", "pending", [labor("AC inspection and service", 1.5), part("cabin", 1), fee("AC gas top-up (R134a)", 3500)]),
      job("Diagnostic scan", "pending", [labor("OBD scan and fault diagnosis", 1)]),
    ],
  });
  const ro7 = mkRo({
    customerId: zainab.customer.id, vehicleId: zainab.vehicles[0].id, status: "estimate", concern: "Grinding noise from rear when braking",
    odometerIn: 23800, createdAt: ago(0, 1),
    jobs: [job("Rear brake shoes", "pending", [labor("Replace rear brake shoes, adjust drums", 1.5), part("shoesMehran", 1)])],
  });
  const ros = [ro1, ro2, ro3, ro4, ro5, ro6, ro7];

  // ---- Stock: opening balances, then parts used on finished jobs ------------
  const movements: StockMovement[] = parts.map((p) => ({
    id: uid(), workshopId: ws.id, partId: p.id, qty: p.qtyOnHand, reason: "opening", note: "Opening stock", userId: owner.id, createdAt: ago(60),
  }));
  for (const ro of ros.filter((r) => r.stockDeducted)) {
    for (const [partId, qty] of approvedPartUsage(ro)) {
      const p = parts.find((x) => x.id === partId)!;
      p.qtyOnHand -= qty;
      movements.push({
        id: uid(), workshopId: ws.id, partId, qty: -qty, reason: "used_on_job", roId: ro.id, note: `Used on RO-${ro.number}`,
        userId: ro.technicianId ?? owner.id, createdAt: ro.completedAt ?? ro.createdAt,
      });
    }
  }

  // ---- Invoices & payments ----------------------------------------------------
  let invSeq = 1;
  const invoices: Invoice[] = [];
  const mkInvoice = (ro: RepairOrder, issuedAt: string, status: Invoice["status"]): Invoice => {
    const jobs = approvedJobs(ro);
    const inv: Invoice = {
      id: uid(), workshopId: ws.id, seq: invSeq, number: `${ws.invoicePrefix}-${String(invSeq).padStart(6, "0")}`,
      roId: ro.id, customerId: ro.customerId, vehicleId: ro.vehicleId,
      lines: jobs.flatMap((j) => j.lines.map((l) => ({
        jobTitle: j.title, kind: l.kind, description: l.description, partId: l.partId, qty: l.qty, unitPrice: l.unitPrice, amount: lineAmount(l),
      }))),
      partsTaxRate: ws.partsTaxRate, laborTaxRate: ws.laborTaxRate, totals: computeTotals(jobs, ro.discount, ws),
      status, voidReason: "", createdBy: cashier.id, issuedAt,
    };
    invSeq++;
    ro.invoiceId = inv.id;
    invoices.push(inv);
    return inv;
  };
  const inv1 = mkInvoice(ro1, ago(1, 3), "paid");
  const inv2 = mkInvoice(ro2, ago(2, 19), "partial");
  const payments: Payment[] = [
    { id: uid(), workshopId: ws.id, invoiceId: inv1.id, method: "cash", amount: inv1.totals.total, reference: "", userId: cashier.id, receivedAt: ago(1, 3) },
    { id: uid(), workshopId: ws.id, invoiceId: inv2.id, method: "bank", amount: toPaisa(20000), reference: "HBL-TRX-88231", userId: cashier.id, receivedAt: ago(2, 18) },
  ];

  ws.nextInvoiceSeq = invSeq;
  ws.nextRoSeq = roSeq;

  const audit: AuditEntry[] = [
    { id: uid(), workshopId: ws.id, userId: owner.id, action: "workshop.created", entity: "workshop", entityId: ws.id, summary: "Demo workshop created", at: ago(60) },
  ];

  return { workshops: [ws], users, customers, vehicles, parts, movements, cannedJobs, ros, invoices, payments, audit };
}
