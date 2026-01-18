import matplotlib.pyplot as plt
from decimal import Decimal
import numpy as np

def plot_increment_difference_pie(prev_calc, new_calc, return_fig=False):
    """
    Pie plot for the difference between two salary calculations, using plot_net_pay_and_taxes logic but for the increment only.
    """
    from decimal import Decimal
    diff = {}
    for k in [
        "gross_including_benefits", "net_per_paga", "cotitzacions_anuals", "irpf_anual",
        "ss_contingencies_comunes_monthly", "t_des_monthly", "ss_training_monthly", "ss_mei_monthly"
    ]:
        diff[k] = new_calc[k] - prev_calc[k]
    n_pagues = new_calc["n_pagues"]
    # Compose annual values for SS
    ss_contingencies_comunes_annual = diff["ss_contingencies_comunes_monthly"] * Decimal(n_pagues)
    t_des_annual = diff["t_des_monthly"] * Decimal(n_pagues)
    ss_training_annual = diff["ss_training_monthly"] * Decimal(n_pagues)
    ss_mei_annual = diff["ss_mei_monthly"] * Decimal(n_pagues)
    fig = plot_net_pay_and_taxes(
        diff["gross_including_benefits"],
        diff["net_per_paga"],
        n_pagues,
        diff["cotitzacions_anuals"],
        diff["irpf_anual"],
        ss_contingencies_comunes_annual,
        t_des_annual,
        ss_training_annual,
        ss_mei_annual,
        return_fig=True
    )
    if return_fig:
        return fig
    else:
        import matplotlib.pyplot as plt
        plt.show()

def plot_net_pay_and_taxes(
    gross_including_benefits: Decimal,
    net_per_paga: Decimal,
    n_pagues: int,
    cotitzacions_anuals: Decimal,
    irpf_anual: Decimal,
    ss_contingencies_comunes_annual: Decimal,
    t_des_annual: Decimal,
    ss_training_annual: Decimal,
    ss_mei_annual: Decimal,
    return_fig: bool = False
):
    fig, axes = plt.subplots(2, 1, figsize=(7, 12))  # Stack vertically, more mobile friendly
    total_taxes_annual = cotitzacions_anuals + irpf_anual
    net_annual = net_per_paga * Decimal(n_pagues)
    net_vs_taxes_labels = ["Sou Net Anual", "Impostos i Cotitzacions Anuals"]
    net_vs_taxes_values = [float(net_annual), float(total_taxes_annual)]
    colors1 = ["#99ff99", "#ff6666"]
    def autopct_format(pct):
        return ('%1.1f%%' % pct) if pct > 3 else ''
    wedges1, texts1, autotexts1 = axes[0].pie(
        net_vs_taxes_values, autopct=autopct_format, startangle=90, colors=colors1,
        textprops={'fontsize': 18, 'color': 'black'}, pctdistance=0.8, labeldistance=1.15)
    axes[0].set_title("Distribució Sou Net vs Impostos Anuals", fontsize=22, fontweight='bold', pad=20)
    axes[0].legend(net_vs_taxes_labels, loc="upper center", bbox_to_anchor=(0.5, -0.08), fontsize=16, ncol=2)
    for text in texts1 + autotexts1:
        text.set_fontsize(18)
    taxes_breakdown_labels = [
        "IRPF",
        "SS: Contingències Comunes",
        "SS: Atur",
        "SS: Formació Professional",
        "SS: MEI"
    ]
    taxes_breakdown_values = [
        float(irpf_anual),
        float(ss_contingencies_comunes_annual),
        float(t_des_annual),
        float(ss_training_annual),
        float(ss_mei_annual)
    ]
    colors2 = ["#ff9999", "#66b3ff", "#6666ff", "#ffcc99", "#c2c2f0"]
    wedges2, texts2, autotexts2 = axes[1].pie(
        taxes_breakdown_values, autopct=autopct_format, startangle=90, colors=colors2,
        textprops={'fontsize': 18, 'color': 'black'}, pctdistance=0.8, labeldistance=1.15)
    axes[1].set_title("Distribució dels impostos i cotitzacions anuals", fontsize=22, fontweight='bold', pad=20)
    axes[1].legend(taxes_breakdown_labels, loc="upper center", bbox_to_anchor=(0.5, -0.08), fontsize=16, ncol=2)
    for text in texts2 + autotexts2:
        text.set_fontsize(18)
    plt.tight_layout(pad=4.0)
    if return_fig:
        return fig
    else:
        plt.show()

def plot_salary_blocks(
    gross: Decimal,
    n_pagues: int,
    pagues_prorratejades: bool,
    retribucio_en_especie_ann: Decimal,
    grup_cotitzacio: str,
    contract_type: str,
    fam,
    region: str,
    other_deductions: Decimal,
    compute_net_pay,
    return_fig: bool = False
):
    # New behavior: plot two lines
    # - Marginal IRPF (%) vs gross
    # - Total IRPF (euros, annual) vs gross
    # We'll sample a grid of gross values and call compute_net_pay for each sample to obtain
    # the base_imponible, marginal rate and total IRPF. Using the marginal returned by
    # compute_net_pay (if available) gives an exact derivative-based marginal.
    gross_float = float(gross)
    if gross_float <= 0:
        raise ValueError("Gross salary must be positive to plot")

    num_points = 200
    xs = np.linspace(0.01, gross_float, num_points)
    gross_points = [Decimal(x) for x in xs]
    marginal_percents = []
    irpf_totals = []

    for g in gross_points:
        res = compute_net_pay(
            g,
            n_pagues,
            pagues_prorratejades,
            retribucio_en_especie_ann,
            grup_cotitzacio,
            contract_type,
            other_deductions,
            fam,
            region
        )
        # prefer precomputed marginal percent from the calculation, otherwise derive it
        if "marginal_irpf_percent" in res:
            m = float(res["marginal_irpf_percent"])
        elif "marginal_irpf_rate" in res:
            m = float(res["marginal_irpf_rate"] * Decimal("100"))
        else:
            # fallback: approximate via small finite difference on IRPF (shouldn't happen often)
            eps = Decimal("1.00")
            r_plus = compute_net_pay(g + eps, n_pagues, pagues_prorratejades, retribucio_en_especie_ann, grup_cotitzacio, contract_type, other_deductions, fam, region)
            irpf_diff = float((r_plus["irpf_anual"] - res["irpf_anual"]))
            m = (irpf_diff / 1.0) / float(g) * 100.0 if g > 0 else 0.0
        marginal_percents.append(m)
        irpf_totals.append(float(res["irpf_anual"]))

    # Build additional series: IRPF as percentage of gross, net annual
    irpf_percents = []
    net_annuals = []
    for g, m, irpf in zip(gross_points, marginal_percents, irpf_totals):
        gross_val = float(g)
        irpf_val = float(irpf)
        irpf_percents.append(100.0 * irpf_val / gross_val if gross_val > 0 else 0.0)
        # compute net annual using compute_net_pay (some callers already provided net in previous loop,
        # but we recompute to be safe and accurate)
        res = compute_net_pay(Decimal(str(gross_val)), n_pagues, pagues_prorratejades, retribucio_en_especie_ann, grup_cotitzacio, contract_type, other_deductions, fam, region)
        net_annuals.append(float(res["net_per_paga"] * Decimal(n_pagues)))

    # Create a vertical column of 4 plots (better for mobile): marginal %, IRPF %, IRPF €, net vs gross
    plt_style = 'seaborn-v0_8-grid'
    try:
        plt.style.use(plt_style)
    except Exception:
        pass

    fig, axes = plt.subplots(4, 1, figsize=(8, 20), sharex=True)
    ax_marginal, ax_irpf_percent, ax_irpf_amount, ax_net_vs_gross = axes

    xvals = [float(x) for x in gross_points]

    # Choose nice tick spacing for x axis (max ~6 ticks)
    try:
        xticks = np.linspace(min(xvals), max(xvals), num=6)
    except Exception:
        xticks = None

    # --- Marginal IRPF (%) ---
    ax_marginal.step(xvals, marginal_percents, where='post', color='#d62728', linewidth=2, label='Marginal IRPF (%)')
    ax_marginal.fill_between(xvals, marginal_percents, color='#d62728', alpha=0.08)
    ax_marginal.set_ylabel('Marginal IRPF (%)', fontsize=12)
    ax_marginal.set_title('Marginal IRPF (%)', fontsize=14, fontweight='bold')
    ax_marginal.grid(alpha=0.4)
    ax_marginal.legend(loc='upper right', fontsize=10)
    ax_marginal.tick_params(axis='y', labelsize=10)

    # --- Total IRPF (%) ---
    ax_irpf_percent.plot(xvals, irpf_percents, color='#ff7f0e', linewidth=2, marker='o', markersize=4, label='IRPF (% of gross)')
    ax_irpf_percent.set_ylabel('IRPF (% of gross)', fontsize=12)
    ax_irpf_percent.set_title('IRPF as % of gross', fontsize=14, fontweight='bold')
    ax_irpf_percent.grid(alpha=0.4)
    ax_irpf_percent.legend(loc='upper left', fontsize=10)
    ax_irpf_percent.tick_params(axis='y', labelsize=10)

    # --- Total IRPF amount ---
    ax_irpf_amount.plot(xvals, irpf_totals, color='#1f77b4', linewidth=2, label='IRPF anual (€)')
    ax_irpf_amount.fill_between(xvals, irpf_totals, color='#1f77b4', alpha=0.06)
    ax_irpf_amount.set_ylabel('IRPF anual (€)', fontsize=12)
    ax_irpf_amount.set_title('IRPF anual (€)', fontsize=14, fontweight='bold')
    ax_irpf_amount.grid(alpha=0.4)
    ax_irpf_amount.legend(loc='upper left', fontsize=10)
    ax_irpf_amount.tick_params(axis='y', labelsize=10)

    # --- Net vs Gross ---
    ax_net_vs_gross.plot(xvals, net_annuals, color='#2ca02c', linewidth=2, label='Sou net anual (€)')
    ax_net_vs_gross.plot(xvals, xvals, color='#7f7f7f', linestyle='--', linewidth=1, label='Sou brut anual (€)')
    ax_net_vs_gross.set_ylabel('Euros (€)', fontsize=12)
    ax_net_vs_gross.set_title('Sou net anual vs Sou brut anual', fontsize=14, fontweight='bold')
    ax_net_vs_gross.grid(alpha=0.4)
    ax_net_vs_gross.legend(loc='upper left', fontsize=10)
    ax_net_vs_gross.tick_params(axis='y', labelsize=10)

    # Common x-axis label and formatting
    if xticks is not None:
        for ax in axes:
            ax.set_xticks(xticks)
    for ax in axes:
        ax.set_xlabel('Sou brut anual (€)', fontsize=12)
        ax.xaxis.set_major_formatter(plt.FuncFormatter(lambda x, pos: f"{int(x):,}"))
        ax.tick_params(axis='x', labelrotation=30, labelsize=10)

    plt.tight_layout(pad=2.5)
    if return_fig:
        return fig
    else:
        plt.show()

def plot_salary_percentages(
    gross: Decimal,
    n_pagues: int,
    pagues_prorratejades: bool,
    retribucio_en_especie_ann: Decimal,
    grup_cotitzacio: str,
    contract_type: str,
    fam,
    region: str,
    other_deductions: Decimal,
    compute_net_pay
):
    step = 1000
    gross_increments = list(range(step, int(gross)+step, step))
    if gross_increments[-1] != gross:
        gross_increments[-1] = int(gross)
    results = []
    for g in gross_increments:
        res = compute_net_pay(
            Decimal(g),
            n_pagues,
            pagues_prorratejades,
            retribucio_en_especie_ann,
            grup_cotitzacio,
            contract_type,
            other_deductions,
            fam,
            region
        )
        net_annual = float(res["net_per_paga"] * Decimal(n_pagues))
        total = float(g)
        breakdown = {
            "gross": g,
            "net": net_annual / total * 100,
            "irpf": float(res["irpf_anual"]) / total * 100,
            "ss_comunes": float(res["ss_contingencies_comunes_monthly"] * Decimal(n_pagues)) / total * 100,
            "ss_atur": float(res["t_des_monthly"] * Decimal(n_pagues)) / total * 100,
            "ss_formacio": float(res["ss_training_monthly"] * Decimal(n_pagues)) / total * 100,
            "ss_mei": float(res["ss_mei_monthly"] * Decimal(n_pagues)) / total * 100,
        }
        results.append(breakdown)
    fig, ax = plt.subplots(figsize=(8, 10))
    x = [r["gross"] for r in results]
    ax.plot(x, [r["net"] for r in results], label="Sou net (%)", linewidth=4, marker='o', markersize=10)
    ax.plot(x, [r["irpf"] for r in results], label="IRPF (%)", linewidth=3, marker='s', markersize=8)
    ax.plot(x, [r["ss_comunes"] for r in results], label="SS: Cont. Comunes (%)", linewidth=3, marker='^', markersize=8)
    ax.plot(x, [r["ss_atur"] for r in results], label="SS: Atur (%)", linewidth=3, marker='D', markersize=8)
    ax.plot(x, [r["ss_formacio"] for r in results], label="SS: Formació (%)", linewidth=3, marker='P', markersize=8)
    ax.plot(x, [r["ss_mei"] for r in results], label="SS: MEI (%)", linewidth=3, marker='X', markersize=8)
    ax.set_xlabel("Sou brut anual (€)", fontsize=18, labelpad=12)
    ax.set_ylabel("Percentatge respecte sou brut", fontsize=18, labelpad=12)
    ax.set_title("Percentatge del sou destinat a cada concepte", fontsize=22, fontweight='bold', pad=20)
    ax.tick_params(axis='x', labelsize=15)
    ax.tick_params(axis='y', labelsize=15)
    ax.grid(True, linestyle="--", alpha=0.5)
    ax.legend(loc="upper left", fontsize=15)
    plt.tight_layout(pad=4.0)
    plt.show()
