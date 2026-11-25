// 로그인 / 회원가입 페이지
(async function () {
  const form = document.getElementById("auth-form");
  const tabLogin = document.getElementById("tab-login");
  const tabSignup = document.getElementById("tab-signup");
  const confirmWrap = document.getElementById("confirm-wrap");
  const submitBtn = document.getElementById("submit-btn");
  const msg = document.getElementById("auth-msg");
  const emailEl = document.getElementById("email");
  const pwEl = document.getElementById("password");
  const pw2El = document.getElementById("password2");

  let mode = "login";

  // 로그인 후 이동할 곳: ?next=... (같은 사이트 안의 페이지만 허용)
  function nextUrl(user) {
    const next = new URLSearchParams(location.search).get("next");
    if (next && /^[a-z]+\.html(\?.*)?$/i.test(next) && !next.startsWith("login.html")) return next;
    return App.isAdmin(user) ? "admin.html" : "index.html";
  }

  // 이미 로그인한 상태면 바로 이동
  const current = await App.getUser();
  if (current) {
    location.replace(nextUrl(current));
    return;
  }

  if (new URLSearchParams(location.search).get("mode") === "signup") setMode("signup");

  function setMode(m) {
    mode = m;
    const isSignup = m === "signup";
    tabLogin.classList.toggle("active", !isSignup);
    tabSignup.classList.toggle("active", isSignup);
    tabLogin.setAttribute("aria-selected", String(!isSignup));
    tabSignup.setAttribute("aria-selected", String(isSignup));
    confirmWrap.classList.toggle("hidden", !isSignup);
    pwEl.autocomplete = isSignup ? "new-password" : "current-password";
    submitBtn.textContent = isSignup ? "회원가입" : "로그인";
    hideMsg();
  }

  function showMsg(text, ok = false) {
    msg.textContent = text;
    msg.className = "msg " + (ok ? "msg-ok" : "msg-error");
  }
  function hideMsg() {
    msg.className = "msg hidden";
  }

  // Supabase 영문 에러 → 한글
  function translate(err) {
    const m = (err && err.message) || "";
    if (/Invalid login credentials/i.test(m)) return "이메일 또는 비밀번호가 올바르지 않습니다.";
    if (/already registered|already exists/i.test(m)) return "이미 가입된 이메일입니다. 로그인해 주세요.";
    if (/Password should be at least/i.test(m)) return "비밀번호는 6자 이상이어야 합니다.";
    if (/valid email|invalid format|Unable to validate email/i.test(m)) return "올바른 이메일 주소를 입력해 주세요.";
    if (/rate limit|too many/i.test(m)) return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
    return m || "알 수 없는 오류가 발생했습니다.";
  }

  tabLogin.addEventListener("click", () => setMode("login"));
  tabSignup.addEventListener("click", () => setMode("signup"));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideMsg();

    const email = emailEl.value.trim();
    const password = pwEl.value;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showMsg("올바른 이메일 주소를 입력해 주세요.");
    if (password.length < 6) return showMsg("비밀번호는 6자 이상이어야 합니다.");
    if (mode === "signup" && password !== pw2El.value) return showMsg("비밀번호 확인이 일치하지 않습니다.");

    submitBtn.disabled = true;
    const original = submitBtn.textContent;
    submitBtn.textContent = "처리 중…";

    const { data, error } =
      mode === "signup"
        ? await sb.auth.signUp({ email, password })
        : await sb.auth.signInWithPassword({ email, password });

    submitBtn.disabled = false;
    submitBtn.textContent = original;

    if (error) return showMsg(translate(error));

    // 이메일 인증을 꺼두었기 때문에 가입하자마자 로그인 상태가 됨
    if (!data.session) {
      return showMsg("가입은 되었지만 자동 로그인이 되지 않았습니다. 로그인 탭에서 다시 로그인해 주세요.");
    }

    showMsg(mode === "signup" ? "가입 완료! 이동합니다…" : "로그인 성공! 이동합니다…", true);
    location.href = nextUrl(data.session.user);
  });
})();
