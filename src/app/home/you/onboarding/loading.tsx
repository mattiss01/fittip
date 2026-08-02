import homeStyles from "../../home.module.css";
import styles from "./onboarding.module.css";

export default function OnboardingLoading() {
  return (
    <main className={`${homeStyles.shell} ${styles.page}`} id="main-content">
      <section className={styles.loadingCard}>
        <p>Guided setup</p>
        <h1>Loading your private draft…</h1>
      </section>
    </main>
  );
}
