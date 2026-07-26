export function SignOutButton() {
  return (
    <form action="/auth/signout" method="post">
      <button className="sign-out" type="submit">
        Sign out
      </button>
    </form>
  );
}
