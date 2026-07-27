# Supabase Auth 이메일 템플릿 설정

TalkTheme은 메일 보안 스캐너가 인증 링크를 미리 열어 OTP를 소비하는 문제를 피하기 위해, 이메일 링크 대신 사용자가 직접 입력하는 8자리 인증번호를 사용한다.

## 전제 조건

- Supabase Auth의 Site URL: `https://talktheme.shop`
- 이메일 템플릿에서 `{{ .ConfirmationURL }}`를 사용하지 않는다. 이 URL은 GET 요청만으로 OTP를 소비할 수 있다.

## Confirm signup 템플릿

Authentication → Emails → Confirm signup의 본문을 아래처럼 설정한다.

```html
<p>TalkTheme 회원가입 인증번호입니다.</p>
<p style="font-size: 28px; font-weight: 700; letter-spacing: 0.2em;">{{ .Token }}</p>
<p>TalkTheme 회원가입 화면에 이 8자리 번호를 입력해 주세요.</p>
```

## Reset password 템플릿

Authentication → Emails → Reset password의 본문을 아래처럼 설정한다.

```html
<p>TalkTheme 비밀번호 재설정 인증번호입니다.</p>
<p style="font-size: 28px; font-weight: 700; letter-spacing: 0.2em;">{{ .Token }}</p>
<p>TalkTheme 비밀번호 찾기 화면에 이 8자리 번호를 입력해 주세요.</p>
```

`{{ .Token }}`은 앱이 `verifyOtp`로 검증한다. 기본 만료 시간은 1시간이며, 재전송은 60초 이후에 가능하다.

## 운영 검증

1. 본인이 제어하는 새 이메일 주소로 가입한다.
2. 메일에서 8자리 인증번호를 확인한다.
3. 회원가입 화면에 번호를 입력해 `/account`로 이동하는지 확인한다.
4. 비밀번호 찾기도 같은 방식으로 실행해 새 비밀번호 설정 화면에 도달하는지 확인한다.
5. 재전송 버튼이 60초 후 활성화되는지 확인한다.
