# GitHub Copilot – Workday Credit Budget

A small [Tampermonkey](https://www.tampermonkey.net/) userscript that displays how many **GitHub Copilot AI credits** you have available per remaining workday.

It adds a budget dashboard directly to the [GitHub Copilot usage settings](https://github.com/settings/copilot/features) page. **These are planning averages, not daily spending limits.**

[**Install the userscript**](https://github.com/Nimetko/copilot-workday-budget/raw/refs/heads/master/copilot-workday-budget.user.js)

## What it shows

- **Planned / workday:** Your monthly numeric credit budget divided by planned weekdays in the current month.
- **Available / workday:** Your remaining credits divided by remaining workdays.
- **Difference / workday:** How far your available average is above or below the planned average.
- **Daily comparison:** A simple visual comparison, plus a status such as *On track* or *Over pace*.
- **Include today:** A toggle to exclude today from the remaining-day calculation; it defaults to on again on each new calendar day.
- **Vacation days left:** The number of remaining vacation workdays this month; adjust with the number field or +/- buttons.

The displayed budget and local preferences are read from the page and Tampermonkey's local storage; the script makes **no external requests**.

## Installation

1. Install the [Tampermonkey browser extension](https://www.tampermonkey.net/).
2. Click **[Install the userscript](https://github.com/Nimetko/copilot-workday-budget/raw/refs/heads/master/copilot-workday-budget.user.js)**.
3. Approve the installation in Tampermonkey.
4. Open or refresh **[GitHub Copilot settings](https://github.com/settings/copilot/features)**.

> In Chrome, if scripts are not running, check Tampermonkey's extension settings and enable the permission to run user scripts (and ensure the extension is enabled).

The dashboard is shown only when the GitHub page contains a numeric usage/limit pair, for example `6,242 / 10,000 AI credits`. It will not infer a credit limit from a plan name.

## Updates

The installed script points `@updateURL` and `@downloadURL` to this repository's `master` branch. Tampermonkey periodically checks for a higher `@version` and can install updates automatically, according to the user's update settings. You can also check for script updates manually in the Tampermonkey dashboard.

**Existing users with missing update URLs or URLs pointing to `main`:** After v1.6.1 is published, use the installation link once to install it with the corrected update URLs. Script storage is keyed to the original `@name` and `@namespace`, which are deliberately unchanged.

## How it works

- Only runs on `https://github.com/settings/copilot/features`.
- Reads the existing **Usage this cycle** section of GitHub's page; no personal access token or extra API request is needed.
- Counts Monday–Friday as working days and adjusts for the number of remaining vacation days you enter.
- Persists vacation-day counts locally per calendar month. An older v1.4 list of vacation dates is migrated when possible.
- Reacts to changes in the page and performs a periodic refresh while the page is open.

### Important assumptions and limitations

- **Calendar month:** This release uses the first and last dates of the current calendar month for its workday calculations. If your organization's Copilot reset cycle differs, the estimates may be inaccurate.
- **Weekdays:** Weekends are excluded automatically. Public holidays, personal working schedules, and future time off are **not** detected; enter upcoming time off as *Vacation days left*.
- **Vacation input:** Enter the workdays you will still be off **later in the current month**, not the number you already took. Adjust the number after a vacation day passes.
- **Changing GitHub UI:** GitHub can change the text or layout of its settings page; the script may need updates.
- **Planning metric:** The dashboard does not enforce an actual daily credit cap and is not affiliated with GitHub.

## Development

No dependencies or build tools are needed. The `.user.js` file at the repository root is the distributable script.

```bash
node --check copilot-workday-budget.user.js
node --test tests/userscript.test.cjs
```

A small GitHub Actions workflow runs both checks on pushes and pull requests.

### Publishing a change

1. Edit `copilot-workday-budget.user.js`.
2. Increase the `@version` field (for example, `1.6.1` → `1.6.2`); otherwise Tampermonkey may not detect a new release.
3. Run the checks, commit, and push to `master`.
4. Users receive the update on their next applicable Tampermonkey update check.

**If you rename the GitHub account or repository**, update both `@updateURL` and `@downloadURL`, along with the links in this README, **before publishing**. The initial URLs assume the repository name `Nimetko/copilot-workday-budget`.

## Share with a colleague

> I made a small Tampermonkey userscript that adds a workday credit budget to the GitHub Copilot usage page. Install Tampermonkey, then click [Install the script](https://github.com/Nimetko/copilot-workday-budget/raw/refs/heads/master/copilot-workday-budget.user.js) and refresh your [Copilot settings](https://github.com/settings/copilot/features). Updates are managed through Tampermonkey.

## License

[MIT](LICENSE) · An independent community tool, not an official GitHub product.
