import matplotlib.pyplot as plt
import matplotlib as mpl
from decimal import Decimal
import numpy as np

# ── Brand palette ────────────────────────────────────────────────────────────
_RED      = "#e2231a"
_RED_DARK = "#b81b13"
_GREEN    = "#52b788"
_ORANGE   = "#e67e22"
_BLUE     = "#3498db"
_PURPLE   = "#9b59b6"
_TEAL     = "#1abc9c"
_GRAY     = "#adb5bd"

_PIE_TAXES_COLORS = [_RED, _ORANGE, _BLUE, _PURPLE, _TEAL]
_PIE_MAIN_COLORS  = [_GREEN, _RED]

def _apply_style():
    mpl.rcParams.update({
        "figure.facecolor":  "white",
        "axes.facecolor":    "white",
        "axes.edgecolor":    "#e0e0e0",
        "axes.grid":         True,
        "grid.color":        "#f0f0f0",
        "grid.linewidth":    1.0,
        "axes.spines.top":   False,
        "axes.spines.right": False,
        "font.family":       "sans-serif",
        "font.sans-serif":   ["Inter", "Helvetica Neue", "Arial", "DejaVu Sans"],
        "text.color":        "#1a1a1a",
        "axes.labelcolor":   "#444444",
        "xtick.color":       "#666666",
        "ytick.color":       "#666666",
    })

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
    _apply_style()
    fig, axes = plt.subplots(2, 1, figsize=(6, 10), facecolor="white")
    total_taxes_annual = cotitzacions_anuals + irpf_anual
    net_annual = net_per_paga * Decimal(n_pagues)

    def autopct_format(pct):
        return (f"{pct:.1f}%") if pct > 3 else ""

    # ── Chart 1: Net vs Total taxes ───────────────────────────────────────────
    net_vs_taxes_labels = ["Sou Net Anual", "Impostos i Cotitzacions"]
    net_vs_taxes_values = [float(net_annual), float(total_taxes_annual)]
    wedges1, _, autotexts1 = axes[0].pie(
        net_vs_taxes_values,
        autopct=autopct_format,
        startangle=90,
        colors=_PIE_MAIN_COLORS,
        pctdistance=0.72,
        wedgeprops={"linewidth": 1.5, "edgecolor": "white"},
    )
    for at in autotexts1:
        at.set_fontsize(13)
        at.set_color("white")
        at.set_fontweight("bold")
    axes[0].set_title(
        "Sou Net vs Impostos Anuals", fontsize=14, fontweight="bold",
        color="#1a1a1a", pad=14,
    )
    axes[0].legend(
        net_vs_taxes_labels, loc="upper center", bbox_to_anchor=(0.5, -0.05),
        fontsize=11, ncol=2, frameon=False,
    )

    # ── Chart 2: Taxes breakdown ──────────────────────────────────────────────
    taxes_breakdown_labels = [
        "IRPF",
        "SS: Contingències Comunes",
        "SS: Atur",
        "SS: Formació Professional",
        "SS: MEI",
    ]
    taxes_breakdown_values = [
        float(irpf_anual),
        float(ss_contingencies_comunes_annual),
        float(t_des_annual),
        float(ss_training_annual),
        float(ss_mei_annual),
    ]
    wedges2, _, autotexts2 = axes[1].pie(
        taxes_breakdown_values,
        autopct=autopct_format,
        startangle=90,
        colors=_PIE_TAXES_COLORS,
        pctdistance=0.72,
        wedgeprops={"linewidth": 1.5, "edgecolor": "white"},
    )
    for at in autotexts2:
        at.set_fontsize(12)
        at.set_color("white")
        at.set_fontweight("bold")
    axes[1].set_title(
        "Desglossat d'Impostos i Cotitzacions", fontsize=14, fontweight="bold",
        color="#1a1a1a", pad=14,
    )
    axes[1].legend(
        taxes_breakdown_labels, loc="upper center", bbox_to_anchor=(0.5, -0.05),
        fontsize=10, ncol=2, frameon=False,
    )

    plt.tight_layout(pad=3.0)
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

    _apply_style()
    fig, axes = plt.subplots(4, 1, figsize=(7, 18), sharex=True, facecolor="white")
    ax_marginal, ax_irpf_percent, ax_irpf_amount, ax_net_vs_gross = axes

    xvals = [float(x) for x in gross_points]

    try:
        xticks = np.linspace(min(xvals), max(xvals), num=6)
    except Exception:
        xticks = None

    _lw = 2.2

    # --- Marginal IRPF (%) ---
    ax_marginal.step(xvals, marginal_percents, where="post", color=_RED, linewidth=_lw)
    ax_marginal.fill_between(xvals, marginal_percents, step="post", color=_RED, alpha=0.10)
    ax_marginal.set_ylabel("Marginal IRPF (%)", fontsize=11)
    ax_marginal.set_title("Tipus Marginal IRPF (%)", fontsize=13, fontweight="bold", color="#1a1a1a", pad=10)

    # --- Total IRPF (%) ---
    ax_irpf_percent.plot(xvals, irpf_percents, color=_ORANGE, linewidth=_lw)
    ax_irpf_percent.fill_between(xvals, irpf_percents, color=_ORANGE, alpha=0.10)
    ax_irpf_percent.set_ylabel("IRPF efectiu (%)", fontsize=11)
    ax_irpf_percent.set_title("IRPF Efectiu sobre el Brut (%)", fontsize=13, fontweight="bold", color="#1a1a1a", pad=10)

    # --- Total IRPF amount ---
    ax_irpf_amount.plot(xvals, irpf_totals, color=_BLUE, linewidth=_lw)
    ax_irpf_amount.fill_between(xvals, irpf_totals, color=_BLUE, alpha=0.08)
    ax_irpf_amount.set_ylabel("IRPF anual (€)", fontsize=11)
    ax_irpf_amount.set_title("IRPF Anual (€)", fontsize=13, fontweight="bold", color="#1a1a1a", pad=10)

    # --- Net vs Gross ---
    ax_net_vs_gross.plot(xvals, net_annuals, color=_GREEN, linewidth=_lw, label="Sou net anual")
    ax_net_vs_gross.plot(xvals, xvals, color=_GRAY, linestyle="--", linewidth=1.4, label="Sou brut anual")
    ax_net_vs_gross.fill_between(xvals, net_annuals, xvals, color=_GRAY, alpha=0.07)
    ax_net_vs_gross.set_ylabel("Euros (€)", fontsize=11)
    ax_net_vs_gross.set_title("Sou Net vs Sou Brut Anual", fontsize=13, fontweight="bold", color="#1a1a1a", pad=10)
    ax_net_vs_gross.legend(loc="upper left", fontsize=10, frameon=False)

    euro_fmt = plt.FuncFormatter(lambda x, _: f"{int(x):,} €".replace(",", "."))
    pct_fmt  = plt.FuncFormatter(lambda x, _: f"{x:.0f}%")

    ax_marginal.yaxis.set_major_formatter(pct_fmt)
    ax_irpf_percent.yaxis.set_major_formatter(pct_fmt)
    ax_irpf_amount.yaxis.set_major_formatter(euro_fmt)
    ax_net_vs_gross.yaxis.set_major_formatter(euro_fmt)

    if xticks is not None:
        for ax in axes:
            ax.set_xticks(xticks)
    for ax in axes:
        ax.set_xlabel("Sou brut anual (€)", fontsize=11)
        ax.xaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f"{int(x):,}"))
        ax.tick_params(axis="x", labelrotation=20, labelsize=9)
        ax.tick_params(axis="y", labelsize=9)

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
